"use server";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { parseConditions } from "@/lib/rules/parse-rule";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappFlowRuns, whatsappFlowSteps, whatsappFlows, whatsappForms } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import {
  FLOW_STEP_KINDS,
  FLOW_TRIGGERS,
  askConfig,
  describeStep,
  validateFlow,
  type SendButtonsConfig,
  type SendMediaConfig,
  type SendTemplateConfig,
  type FlowStep,
  type FlowStepKind,
  type FlowTrigger,
} from "@/lib/whatsapp/flow-engine";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import { FORM_SCREEN_ID } from "@/lib/whatsapp/flow-form";
import { sendFlowMessage, sendMediaByLink, sendReplyButtons, sendTemplateMessage, sendTextMessage } from "@/lib/integrations/whatsapp/client";
import { planFlowTest, sampleParams } from "@/lib/whatsapp/flow-test";
import { STARTER_FLOWS } from "@/lib/whatsapp/starter-flows";
import { startFlowForContacts, startFlows } from "@/lib/whatsapp/flow-runner";

export interface FlowFormState {
  error?: string;
  success?: string;
}

/**
 * Flows run on the direct client throughout, and the permission check
 * below is the whole of the check — `whatsapp.campaign` is an org-wide
 * primitive with no centre dimension, the same call migration 0028 made
 * for broadcasts. The run tables have no authenticated UPDATE policy at
 * all because a run's progress is the engine's to write.
 */
async function requireCampaigner() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return null;
  return user;
}

function isTrigger(value: unknown): value is FlowTrigger {
  return (FLOW_TRIGGERS as readonly string[]).includes(String(value));
}

function isStepKind(value: unknown): value is FlowStepKind {
  return (FLOW_STEP_KINDS as readonly string[]).includes(String(value));
}

function readJson(raw: FormDataEntryValue | null): Record<string, unknown> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function saveFlow(_prev: FlowFormState, formData: FormData): Promise<FlowFormState> {
  const user = await requireCampaigner();
  if (!user) return { error: "You don't have permission to do that." };

  const flowId = String(formData.get("flowId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const audience = formData.get("audience") === "contact" ? ("contact" as const) : ("lead" as const);
  // A flow for the database has no lead events to react to: it is started by
  // hand for chosen lists.
  const triggerType = audience === "contact" ? "manual" : formData.get("triggerType");
  const centerId = String(formData.get("centerId") ?? "").trim() || null;

  if (!name) return { error: "Give the automation a name." };
  if (!isTrigger(triggerType)) return { error: "Pick what starts it." };

  const triggerConfig = readJson(formData.get("triggerConfig"));
  if (triggerType === "temperature_entered" && !triggerConfig.temperature) {
    return { error: "Pick the temperature that starts it." };
  }
  if (
    triggerType === "inbound_keyword" &&
    (!Array.isArray(triggerConfig.keywords) || triggerConfig.keywords.length === 0)
  ) {
    return { error: "Give at least one word to listen for." };
  }

  // Validated, not merely parsed: these conditions are evaluated against
  // every lead the trigger fires for, inside `startFlows()`, which is
  // called from the middle of ordinary work and swallows its own errors.
  // An unknown field name stored here would make the automation silently
  // reach nobody, with nothing anywhere saying why.
  const appliesToParsed = parseConditions(audience === "contact" ? null : formData.get("appliesTo"));
  if (!appliesToParsed.ok) return { error: appliesToParsed.error };
  const conditions = appliesToParsed.value.all ?? [];
  // Stored as a fresh object rather than the parser's `RuleConditions`,
  // which is an interface and so has no implicit index signature to
  // satisfy the jsonb column's type. Null when empty, so "no narrowing"
  // is one representation rather than two.
  const appliesTo = conditions.length > 0 ? { all: conditions } : null;

  const values = { name, description, triggerType, triggerConfig, centerId, appliesTo };

  let savedId: string;
  if (flowId) {
    // The audience is fixed when the flow is created: switching a flow
    // that has runs from leads to contacts would orphan every one of them.
    await db
      .update(whatsappFlows)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(whatsappFlows.id, flowId));
    savedId = flowId;
  } else {
    const [created] = await db
      .insert(whatsappFlows)
      .values({ ...values, audience, createdBy: user.id })
      .returning({ id: whatsappFlows.id });
    savedId = created.id;
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: flowId ? "whatsapp.flow_update" : "whatsapp.flow_create",
    entityType: "whatsapp_flows",
    entityId: savedId,
    after: values,
  });

  revalidatePath("/whatsapp/flows");
  revalidatePath(`/whatsapp/flows/${savedId}`);
  return { success: flowId ? "Saved." : `Created ${name}.` };
}

/**
 * Adds a step to the end.
 *
 * Always the end, never inserted into the middle: `position` is what a
 * branch jumps to, so renumbering an existing flow would silently
 * redirect every branch pointing at the renumbered steps. Appending
 * cannot do that.
 */
export async function addStep(_prev: FlowFormState, formData: FormData): Promise<FlowFormState> {
  const user = await requireCampaigner();
  if (!user) return { error: "You don't have permission to do that." };

  const flowId = String(formData.get("flowId") ?? "").trim();
  const kind = formData.get("kind");
  if (!flowId) return { error: "Which automation?" };
  if (!isStepKind(kind)) return { error: "Pick what the step does." };

  const [last] = await db
    .select({ position: whatsappFlowSteps.position })
    .from(whatsappFlowSteps)
    .where(eq(whatsappFlowSteps.flowId, flowId))
    .orderBy(sql`position desc`)
    .limit(1);

  await db.insert(whatsappFlowSteps).values({
    flowId,
    position: (last?.position ?? 0) + 1,
    kind,
    config: readJson(formData.get("config")),
  });

  revalidatePath(`/whatsapp/flows/${flowId}`);
  return { success: "Step added." };
}

export async function updateStep(_prev: FlowFormState, formData: FormData): Promise<FlowFormState> {
  const user = await requireCampaigner();
  if (!user) return { error: "You don't have permission to do that." };

  const stepId = String(formData.get("stepId") ?? "").trim();
  const flowId = String(formData.get("flowId") ?? "").trim();
  if (!stepId || !flowId) return { error: "Which step?" };

  await db
    .update(whatsappFlowSteps)
    .set({ config: readJson(formData.get("config")), updatedAt: new Date() })
    .where(eq(whatsappFlowSteps.id, stepId));

  revalidatePath(`/whatsapp/flows/${flowId}`);
  return { success: "Step saved." };
}

/**
 * Removes a step.
 *
 * The remaining steps keep their numbers — gaps and all. A flow reading
 * 1, 2, 4, 5 looks odd for about a second; renumbering would send every
 * branch pointing at step 4 to whatever ended up there instead, which
 * looks fine and is wrong.
 */
export async function deleteStep(_prev: FlowFormState, formData: FormData): Promise<FlowFormState> {
  const user = await requireCampaigner();
  if (!user) return { error: "You don't have permission to do that." };

  const stepId = String(formData.get("stepId") ?? "").trim();
  const flowId = String(formData.get("flowId") ?? "").trim();
  if (!stepId || !flowId) return { error: "Which step?" };

  await db.delete(whatsappFlowSteps).where(eq(whatsappFlowSteps.id, stepId));
  revalidatePath(`/whatsapp/flows/${flowId}`);
  return { success: "Step removed. The other steps keep their numbers." };
}

/**
 * Switches a flow on, or off.
 *
 * On is refused while `validateFlow` has anything to say. An active flow
 * that jumps to a step which does not exist silently ends everybody's
 * run, and a wait-for-reply with no answers can only ever time out —
 * both are the kind of fault nobody notices for a month.
 *
 * Off does NOT stop the runs already going. Somebody mid-conversation
 * who has been asked a question should get the answer to it; switching
 * off stops NEW people entering. Stopping the live ones is its own
 * button, so it is a deliberate act.
 */
export async function setFlowActive(
  _prev: FlowFormState,
  formData: FormData,
): Promise<FlowFormState> {
  const user = await requireCampaigner();
  if (!user) return { error: "You don't have permission to do that." };

  const flowId = String(formData.get("flowId") ?? "").trim();
  const active = formData.get("active") === "true";
  if (!flowId) return { error: "Which automation?" };

  if (active) {
    const steps = await db
      .select()
      .from(whatsappFlowSteps)
      .where(eq(whatsappFlowSteps.flowId, flowId))
      .orderBy(asc(whatsappFlowSteps.position));
    const issues = validateFlow(
      steps.map(
        (row): FlowStep => ({
          id: row.id,
          position: row.position,
          kind: row.kind,
          config: row.config ?? {},
        }),
      ),
      (await db.select({ t: whatsappFlows.triggerType }).from(whatsappFlows).where(eq(whatsappFlows.id, flowId)))[0]?.t,
    );
    if (issues.length > 0) {
      return {
        error: issues
          .map((issue) =>
            issue.position ? `Step ${issue.position}: ${issue.message}` : issue.message,
          )
          .join(" "),
      };
    }
  }

  await db
    .update(whatsappFlows)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(whatsappFlows.id, flowId));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: active ? "whatsapp.flow_activate" : "whatsapp.flow_deactivate",
    entityType: "whatsapp_flows",
    entityId: flowId,
    after: { isActive: active },
  });

  revalidatePath("/whatsapp/flows");
  revalidatePath(`/whatsapp/flows/${flowId}`);
  return { success: active ? "Switched on." : "Switched off. Runs already going will finish." };
}

/** Ends every live run on this flow. Separate from switching it off, on purpose. */
export async function stopAllRuns(
  _prev: FlowFormState,
  formData: FormData,
): Promise<FlowFormState> {
  const user = await requireCampaigner();
  if (!user) return { error: "You don't have permission to do that." };

  const flowId = String(formData.get("flowId") ?? "").trim();
  if (!flowId) return { error: "Which automation?" };

  const stopped = await db
    .update(whatsappFlowRuns)
    .set({
      status: "stopped",
      stopReason: "Stopped by an admin.",
      endedAt: new Date(),
      wakeAt: null,
      awaitingStepId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(whatsappFlowRuns.flowId, flowId),
        sql`${whatsappFlowRuns.status} in ('running','waiting')`,
      ),
    )
    .returning({ id: whatsappFlowRuns.id });

  revalidatePath(`/whatsapp/flows/${flowId}`);
  return { success: `Stopped ${stopped.length} run${stopped.length === 1 ? "" : "s"}.` };
}

export async function deleteFlow(_prev: FlowFormState, formData: FormData): Promise<FlowFormState> {
  const user = await requireCampaigner();
  if (!user) return { error: "You don't have permission to do that." };

  const flowId = String(formData.get("flowId") ?? "").trim();
  if (!flowId) return { error: "Which automation?" };

  // Soft, like everything else in this system (CLAUDE.md § 5). The runs
  // stay readable: "why did this student get that message in March?" is
  // a question somebody will ask about a flow that no longer exists.
  await db
    .update(whatsappFlows)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(whatsappFlows.id, flowId), isNull(whatsappFlows.deletedAt)));

  revalidatePath("/whatsapp/flows");
  return { success: "Removed." };
}

/** Puts one lead into a flow by hand — for testing it, and for the `manual` trigger. */
export async function startFlowForLead(
  _prev: FlowFormState,
  formData: FormData,
): Promise<FlowFormState> {
  const user = await requireCampaigner();
  if (!user) return { error: "You don't have permission to do that." };

  const flowId = String(formData.get("flowId") ?? "").trim();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!flowId || !leadId) return { error: "Pick a lead." };

  const [flow] = await db
    .select({ id: whatsappFlows.id, isActive: whatsappFlows.isActive })
    .from(whatsappFlows)
    .where(and(eq(whatsappFlows.id, flowId), isNull(whatsappFlows.deletedAt)));
  if (!flow) return { error: "That automation no longer exists." };
  if (!flow.isActive) return { error: "Switch it on first." };

  const [created] = await db
    .insert(whatsappFlowRuns)
    .values({ flowId, leadId, status: "running", wakeAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: whatsappFlowRuns.id });

  revalidatePath(`/whatsapp/flows/${flowId}`);
  if (!created) return { error: "That lead is already partway through this one." };
  return { success: "Started. It moves on the next sweep." };
}

/** Kept so `startFlows` is reachable from a server action for the manual trigger. */
export async function triggerManualFlows(leadId: string): Promise<number> {
  const user = await requireCampaigner();
  if (!user) return 0;
  return startFlows("manual", { leadId });
}

/**
 * Starts a database flow for everyone on the chosen lists.
 *
 * Only lists marked as having agreed to WhatsApp are accepted, and the people
 * on them who are leads or have opted out are left out here and again before
 * each message. Needs `contact.read` as well as `whatsapp.campaign`: sending
 * to the database is reaching into it.
 */
export async function startFlowForLists(
  _prev: FlowFormState,
  formData: FormData,
): Promise<FlowFormState> {
  const user = await requireCampaigner();
  if (!user) return { error: "You don't have permission to do that." };
  if (!can(user, "contact.read")) return { error: "You don't have access to the database." };

  const flowId = String(formData.get("flowId") ?? "").trim();
  const listIds = formData.getAll("listIds").map(String).filter(Boolean);
  if (!flowId) return { error: "Which automation?" };
  if (listIds.length === 0) return { error: "Tick at least one list." };

  const [flow] = await db
    .select({ id: whatsappFlows.id, isActive: whatsappFlows.isActive, audience: whatsappFlows.audience })
    .from(whatsappFlows)
    .where(and(eq(whatsappFlows.id, flowId), isNull(whatsappFlows.deletedAt)));
  if (!flow) return { error: "That automation no longer exists." };
  if (flow.audience !== "contact") return { error: "This automation is for leads." };
  if (!flow.isActive) return { error: "Switch it on first." };

  const agreed = await db.execute<{ id: string }>(sql`
    select id from contact_lists
    where archived_at is null and use_for_whatsapp
      and id in (${sql.join(listIds.map((id) => sql`${id}::uuid`), sql`, `)})
  `);
  const allowed = [...agreed].map((r) => r.id);
  if (allowed.length === 0) return { error: "None of those lists is marked as agreed to WhatsApp." };

  const { started, skipped } = await startFlowForContacts(flowId, allowed);

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.flow_start_lists",
    entityType: "whatsapp_flows",
    entityId: flowId,
    after: { listIds: allowed, started, skipped },
  });

  revalidatePath(`/whatsapp/flows/${flowId}`);
  return {
    success: `Started for ${started} ${started === 1 ? "person" : "people"}${
      skipped > 0 ? `; ${skipped} left out (leads, opted out, already in it, or no number)` : ""
    }. The first message goes on the next sweep, within about ten minutes.`,
  };
}

/**
 * Copies a ready-made automation into a new, switched-off flow and opens it.
 * Off by default for the same reason every new automation is: it should be
 * read and edited before it can message anybody.
 */
export async function createStarterFlow(formData: FormData): Promise<void> {
  const user = await requireCampaigner();
  if (!user) return;
  const starter = STARTER_FLOWS.find((s) => s.key === String(formData.get("key") ?? ""));
  if (!starter) return;

  const [flow] = await db
    .insert(whatsappFlows)
    .values({
      name: starter.name,
      description: starter.description,
      triggerType: starter.triggerType,
      triggerConfig: starter.triggerConfig,
      createdBy: user.id,
    })
    .returning({ id: whatsappFlows.id });
  await db
    .insert(whatsappFlowSteps)
    .values(starter.steps.map((step, index) => ({ flowId: flow.id, position: index + 1, kind: step.kind, config: step.config })));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.flow_create",
    entityType: "whatsapp_flows",
    entityId: flow.id,
    after: { starter: starter.key },
  });
  revalidatePath("/whatsapp/flows");
  redirect(`/whatsapp/flows/${flow.id}`);
}

export interface FlowTestState {
  error?: string;
  success?: string;
  /** One line per step: what was sent, or why it was skipped or refused. */
  report?: string[];
}

/**
 * Sends the flow's messages to one number so the author can see them on a
 * phone. Touches no lead and starts no run. A typed message only reaches
 * somebody who wrote to the institute's number in the last 24 hours, so the
 * report says when WhatsApp refused one for that reason.
 */
export async function sendFlowTest(_prev: FlowTestState, formData: FormData): Promise<FlowTestState> {
  const user = await requireCampaigner();
  if (!user) return { error: "You don't have permission to do that." };

  const flowId = String(formData.get("flowId") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!flowId) return { error: "Which automation?" };
  if (!phone) return { error: "Enter your own WhatsApp number, with the country code." };

  const rows = await db
    .select()
    .from(whatsappFlowSteps)
    .where(eq(whatsappFlowSteps.flowId, flowId))
    .orderBy(asc(whatsappFlowSteps.position));
  if (rows.length === 0) return { error: "This automation has no steps yet." };

  const { access_token: accessToken, phone_number_id: phoneNumberId } = await getIntegrationCredentials("whatsapp", [
    "access_token",
    "phone_number_id",
  ]);
  if (!accessToken || !phoneNumberId) return { error: "WhatsApp isn't connected." };

  const plan = planFlowTest(rows.map((row): FlowStep => ({ id: row.id, position: row.position, kind: row.kind, config: row.config ?? {} })));
  const report: string[] = [];
  let sent = 0;
  for (const item of plan) {
    if (item.action === "skip") {
      report.push(`Step ${item.position}: skipped — ${item.reason}`);
      continue;
    }
    const { step } = item;
    try {
      if (step.kind === "send_template") {
        const config = step.config as Partial<SendTemplateConfig>;
        if (!config.templateName) throw new Error("No template chosen.");
        const params = sampleParams(config);
        await sendTemplateMessage(phoneNumberId, accessToken, phone, config.templateName, config.templateLanguage ?? "en_US", params.length > 0 ? params : undefined);
      } else if (step.kind === "send_text") {
        await sendTextMessage(phoneNumberId, accessToken, phone, String((step.config as { text?: unknown }).text ?? ""));
      } else if (step.kind === "send_buttons") {
        const config = step.config as Partial<SendButtonsConfig>;
        await sendReplyButtons(phoneNumberId, accessToken, phone, { body: String(config.text ?? ""), buttons: (config.buttons ?? []).map(String) });
      } else if (step.kind === "send_form") {
        const formId = String((step.config as { formId?: unknown }).formId ?? "");
        const [form] = await db.select().from(whatsappForms).where(eq(whatsappForms.id, formId));
        if (!form || form.status !== "published" || !form.metaFlowId) throw new Error("That form isn't published.");
        await sendFlowMessage(phoneNumberId, accessToken, phone, { flowId: form.metaFlowId, body: form.introText, buttonLabel: form.buttonLabel, screenId: FORM_SCREEN_ID, flowToken: `form:${form.id}` });
      } else if (step.kind === "send_media") {
        const config = step.config as Partial<SendMediaConfig>;
        await sendMediaByLink(phoneNumberId, accessToken, phone, {
          kind: config.kind ?? "image",
          link: String(config.url ?? ""),
          caption: config.caption || undefined,
          fileName: config.filename || undefined,
        });
      } else {
        await sendTextMessage(phoneNumberId, accessToken, phone, askConfig(step).question);
      }
      sent += 1;
      report.push(`Step ${item.position}: sent — ${describeStep(step)}`);
    } catch (error) {
      const message = error instanceof MetaGraphApiError ? error.message : "Could not reach WhatsApp.";
      report.push(`Step ${item.position}: not sent — ${message}`);
    }
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action: "whatsapp.flow_test", entityType: "whatsapp_flows", entityId: flowId, after: { sent } });
  const note =
    sent < plan.filter((p) => p.action === "send").length
      ? " Typed messages and buttons only reach a number that has written to the institute's WhatsApp in the last 24 hours — send it a message first, then test again."
      : "";
  return { success: `Sent ${sent} message${sent === 1 ? "" : "s"} to ${phone}.${note}`, report };
}
