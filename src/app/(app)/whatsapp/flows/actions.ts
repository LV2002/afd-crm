"use server";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappFlowRuns, whatsappFlowSteps, whatsappFlows } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import {
  FLOW_STEP_KINDS,
  FLOW_TRIGGERS,
  validateFlow,
  type FlowStep,
  type FlowStepKind,
  type FlowTrigger,
} from "@/lib/whatsapp/flow-engine";
import { startFlows } from "@/lib/whatsapp/flow-runner";

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
  const triggerType = formData.get("triggerType");
  const centerId = String(formData.get("centerId") ?? "").trim() || null;

  if (!name) return { error: "Give the automation a name." };
  if (!isTrigger(triggerType)) return { error: "Pick what starts it." };

  const triggerConfig = readJson(formData.get("triggerConfig"));
  if (triggerType === "stage_entered" && !triggerConfig.stageId) {
    return { error: "Pick the stage that starts it." };
  }
  if (triggerType === "tag_added" && !triggerConfig.tagId) {
    return { error: "Pick the tag that starts it." };
  }
  if (
    triggerType === "inbound_keyword" &&
    (!Array.isArray(triggerConfig.keywords) || triggerConfig.keywords.length === 0)
  ) {
    return { error: "Give at least one word to listen for." };
  }

  const values = { name, description, triggerType, triggerConfig, centerId };

  let savedId: string;
  if (flowId) {
    await db
      .update(whatsappFlows)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(whatsappFlows.id, flowId));
    savedId = flowId;
  } else {
    const [created] = await db
      .insert(whatsappFlows)
      .values({ ...values, createdBy: user.id })
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
