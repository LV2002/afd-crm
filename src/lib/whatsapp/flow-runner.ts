import "server-only";

import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import {
  evaluateConditions,
  type RuleConditions,
} from "@/lib/assignment/evaluate-conditions";
import { db } from "@/lib/db/client";
import { messageableContactIds } from "@/lib/contacts/whatsapp-eligibility";
import {
  contactListMembers,
  contacts,
  leads,
  whatsappFlowRunEvents,
  whatsappFlowRuns,
  whatsappFlowSteps,
  whatsappFlows,
  whatsappMessages,
} from "@/lib/db/schema";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { sendTemplateMessage } from "@/lib/integrations/whatsapp/client";
import { notify } from "@/lib/notifications/notify";

import {
  MAX_STEPS_PER_ADVANCE,
  describeStep,
  firstStep,
  matchBranch,
  nextStep,
  resolveGoto,
  stepAt,
  waitConfig,
  waitMs,
  type FlowStep,
  type FlowTrigger,
  type SendTemplateConfig,
} from "./flow-engine";
import { resolveMergeValues } from "./merge-values";
import { parseParamSources, resolveParams } from "./personalise";
import { suppressedAmong } from "./opt-out";

/**
 * The part of automation flows that actually does things.
 *
 * `flow-engine.ts` decides; this carries out. Three ways in:
 *
 *  - `startFlows()` — something happened to a lead, so any flow watching
 *    for it gets a run.
 *  - `advanceRuns()` — the sweep, walking every run whose wait is over.
 *  - `resolveReply()` — a lead replied, so any run parked waiting for
 *    them branches on what they said.
 *
 * Runs on the direct client, same trust boundary as every cron here.
 *
 * ## What it refuses to do
 *
 * Message somebody who opted out, is marked do-not-contact, or has no
 * number. Checked at the moment of sending rather than when the run
 * started, because a run can sit parked for a fortnight and "we had
 * already decided to message them" is not a defence anybody accepts.
 *
 * Everything it sends is a TEMPLATE. A run reaches somebody days after
 * they last wrote, which is outside the 24-hour window, and a template
 * is the only thing Meta accepts out there.
 */

/** One sweep's worth of runs. Sized like the broadcast sweep, for the same reasons. */
const RUNS_PER_SWEEP = 100;

interface RunRow {
  id: string;
  flowId: string;
  /** Exactly one of leadId / contactId is set: a flow is for leads or for the database. */
  leadId: string | null;
  contactId: string | null;
  currentStepId: string | null;
}

async function logEvent(
  runId: string,
  stepId: string | null,
  kind: string,
  detail: string | null,
): Promise<void> {
  await db.insert(whatsappFlowRunEvents).values({ runId, stepId, kind, detail });
}

async function endRun(runId: string, status: string, reason: string): Promise<void> {
  await db
    .update(whatsappFlowRuns)
    .set({
      status,
      stopReason: reason,
      endedAt: new Date(),
      wakeAt: null,
      awaitingStepId: null,
      updatedAt: new Date(),
    })
    .where(eq(whatsappFlowRuns.id, runId));
}

/**
 * Puts a lead into every active flow watching for this trigger.
 *
 * Conflicts are ignored rather than checked for: the partial unique
 * index on (flow, lead) where the run is live is what guarantees one
 * copy, and doing it in the database means two simultaneous status
 * changes cannot race a read-then-insert into two runs.
 *
 * Never throws into its caller. This is called from the middle of
 * ordinary work — saving a lead, changing its temperature — and an automation
 * failing must not take that work down with it.
 */
export async function startFlows(
  trigger: FlowTrigger,
  input: { leadId: string; temperature?: string | null; text?: string | null },
): Promise<number> {
  try {
    // The whole row, not three columns: a flow's `applies_to` conditions
    // are evaluated against it below, and which columns they name is
    // configuration an admin changes without a deploy.
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, input.leadId), isNull(leads.deletedAt)));
    if (!lead) return 0;
    // Nothing automated ever starts for somebody marked do-not-contact.
    // Checked again at send time; this just avoids the pointless run.
    if (lead.doNotContact) return 0;

    const candidates = await db
      .select()
      .from(whatsappFlows)
      .where(
        and(
          eq(whatsappFlows.triggerType, trigger),
          eq(whatsappFlows.isActive, true),
          // Contact flows are started by hand for chosen lists, never by a lead event.
          eq(whatsappFlows.audience, "lead"),
          isNull(whatsappFlows.deletedAt),
          // A flow may be pinned to one centre. Null reaches everybody.
          or(
            isNull(whatsappFlows.centerId),
            eq(whatsappFlows.centerId, lead.centerId ?? sql`null`),
          ),
        ),
      );

    let started = 0;
    for (const flow of candidates) {
      if (!triggerMatches(flow.triggerType, flow.triggerConfig, input)) continue;

      // The trigger said when; this says for whom. Null `applies_to` is
      // every lead the trigger fired for, which is what every flow
      // written before the column meant.
      if (
        flow.appliesTo &&
        !evaluateConditions(flow.appliesTo as RuleConditions, lead)
      ) {
        continue;
      }

      const [created] = await db
        .insert(whatsappFlowRuns)
        .values({ flowId: flow.id, leadId: input.leadId, status: "running", wakeAt: new Date() })
        .onConflictDoNothing()
        .returning({ id: whatsappFlowRuns.id });
      if (created) {
        await logEvent(created.id, null, "started", `Trigger: ${flow.triggerType}`);
        started += 1;
      }
    }
    return started;
  } catch {
    // Deliberately silent to the caller. See the function comment.
    return 0;
  }
}

/** Whether this particular flow cares about this particular event. */
function triggerMatches(
  trigger: string,
  config: Record<string, unknown> | null,
  input: { temperature?: string | null; text?: string | null },
): boolean {
  if (trigger === "lead_created" || trigger === "manual") return true;
  if (trigger === "temperature_entered")
    return Boolean(config?.temperature) && config?.temperature === input.temperature;
  if (trigger === "inbound_keyword") {
    const keywords = Array.isArray(config?.keywords) ? config.keywords : [];
    const text = (input.text ?? "").trim().toLowerCase();
    if (!text) return false;
    return keywords.some(
      (keyword) =>
        typeof keyword === "string" &&
        keyword.trim() &&
        text.includes(keyword.trim().toLowerCase()),
    );
  }
  return false;
}

async function stepsFor(flowId: string): Promise<FlowStep[]> {
  const rows = await db
    .select()
    .from(whatsappFlowSteps)
    .where(eq(whatsappFlowSteps.flowId, flowId))
    .orderBy(asc(whatsappFlowSteps.position));
  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    kind: row.kind,
    config: row.config ?? {},
  }));
}

/**
 * Sends one step's template to one lead.
 *
 * Returns a reason string when it refused, so the run records WHY
 * somebody stopped hearing from us rather than just stopping.
 */
async function sendStep(
  step: FlowStep,
  subject: { leadId: string | null; contactId: string | null },
): Promise<{ ok: true; waMessageId: string } | { ok: false; reason: string; fatal: boolean }> {
  const config = step.config as Partial<SendTemplateConfig>;
  if (!config.templateName) return { ok: false, reason: "No template on this step.", fatal: true };

  if (subject.contactId) return sendStepToContact(step, subject.contactId);
  if (!subject.leadId) return { ok: false, reason: "This run has nobody to send to.", fatal: true };
  const leadId = subject.leadId;

  const [lead] = await db
    .select({
      id: leads.id,
      studentName: leads.studentName,
      primaryPhone: leads.primaryPhone,
      doNotContact: leads.doNotContact,
      centerId: leads.centerId,
      assignedTo: leads.assignedTo,
      coursesInterested: leads.coursesInterested,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)));
  if (!lead) return { ok: false, reason: "The lead no longer exists.", fatal: true };

  const phone = lead.primaryPhone ? normalizePhone(lead.primaryPhone) : null;
  if (!phone) return { ok: false, reason: "No phone number on the record.", fatal: true };
  if (lead.doNotContact) return { ok: false, reason: "Marked do not contact.", fatal: true };

  // Re-read every time, never cached across a run: somebody can send STOP
  // between step 2 and step 3, which may be a fortnight apart.
  const suppressed = await suppressedAmong(db, [phone]);
  if (suppressed.has(phone))
    return { ok: false, reason: "Opted out of WhatsApp messages.", fatal: true };

  const { access_token: accessToken, phone_number_id: phoneNumberId } =
    await getIntegrationCredentials("whatsapp", ["access_token", "phone_number_id"]);
  if (!accessToken || !phoneNumberId) {
    // NOT fatal: the number will be connected one day and the run should
    // still be there when it is.
    return { ok: false, reason: "WhatsApp isn't connected.", fatal: false };
  }

  // The same per-recipient values broadcasts use, so "Hi Anjali" means
  // the same thing in a flow as it does in a campaign.
  const sources = parseParamSources(config.params);
  let params: string[] = [];
  if (sources.length > 0) {
    const values = await resolveMergeValues(
      "lead",
      [
        {
          id: lead.id,
          name: lead.studentName,
          record: {
            center_id: lead.centerId,
            assigned_to: lead.assignedTo,
            courses_interested: lead.coursesInterested,
          },
        },
      ],
      sources.flatMap((source) => (source.kind === "variable" ? [source.key] : [])),
    );
    const resolved = resolveParams(sources, values.get(lead.id) ?? {});
    if (resolved.missing.length > 0) {
      return {
        ok: false,
        reason: `Nothing to put in ${resolved.missing.map((n) => `{{${n}}}`).join(", ")}.`,
        fatal: true,
      };
    }
    params = resolved.params;
  }

  const waMessageId = await sendTemplateMessage(
    phoneNumberId,
    accessToken,
    phone,
    config.templateName,
    config.templateLanguage ?? "en_US",
    params.length > 0 ? params : undefined,
  );

  // Recorded on the lead's thread like any other message. An automated
  // message the counsellor cannot see is one they will contradict.
  await db.insert(whatsappMessages).values({
    leadId: lead.id,
    counsellorId: lead.assignedTo,
    direction: "outbound",
    waMessageId,
    fromPhone: phoneNumberId,
    toPhone: phone,
    messageType: "template",
    templateName: config.templateName,
    body: params.join(" · ") || null,
    status: "sent",
  });

  return { ok: true, waMessageId };
}

/**
 * The same send, for a person in the contact database.
 *
 * Eligibility is asked again here, on every step, exactly as the broadcast
 * sweep does: a contact can become a lead, be taken off the list, or have
 * the list's "agreed to WhatsApp" tick removed between two steps a fortnight
 * apart. Becoming a lead ends the run: the leads side owns that person now.
 * Nothing is logged to a lead's chat (there is no lead).
 */
async function sendStepToContact(
  step: FlowStep,
  contactId: string,
): Promise<{ ok: true; waMessageId: string } | { ok: false; reason: string; fatal: boolean }> {
  const config = step.config as Partial<SendTemplateConfig>;

  const [contact] = await db
    .select({ id: contacts.id, name: contacts.name, phone: contacts.phone })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
  if (!contact) return { ok: false, reason: "The contact no longer exists.", fatal: true };

  const phone = contact.phone ? normalizePhone(contact.phone) : null;
  if (!phone) return { ok: false, reason: "No phone number on the record.", fatal: true };

  const eligible = await messageableContactIds([contact.id]);
  if (!eligible.has(contact.id)) {
    return {
      ok: false,
      reason: "No longer on a list that may be messaged, or has since become a lead.",
      fatal: true,
    };
  }

  const suppressed = await suppressedAmong(db, [phone]);
  if (suppressed.has(phone)) return { ok: false, reason: "Opted out of WhatsApp messages.", fatal: true };

  const { access_token: accessToken, phone_number_id: phoneNumberId } =
    await getIntegrationCredentials("whatsapp", ["access_token", "phone_number_id"]);
  if (!accessToken || !phoneNumberId) return { ok: false, reason: "WhatsApp isn't connected.", fatal: false };

  const sources = parseParamSources(config.params);
  let params: string[] = [];
  if (sources.length > 0) {
    const [row] = await db.select().from(contacts).where(eq(contacts.id, contact.id));
    const record: Record<string, unknown> = { ...(row?.fields ?? {}), student_name: contact.name, primary_phone: phone };
    const values = await resolveMergeValues(
      "contact",
      [{ id: contact.id, name: contact.name, record }],
      sources.flatMap((source) => (source.kind === "variable" ? [source.key] : [])),
    );
    const resolved = resolveParams(sources, values.get(contact.id) ?? {});
    if (resolved.missing.length > 0) {
      return {
        ok: false,
        reason: `Nothing to put in ${resolved.missing.map((n) => `{{${n}}}`).join(", ")}.`,
        fatal: true,
      };
    }
    params = resolved.params;
  }

  const waMessageId = await sendTemplateMessage(
    phoneNumberId,
    accessToken,
    phone,
    config.templateName ?? "",
    config.templateLanguage ?? "en_US",
    params.length > 0 ? params : undefined,
  );
  return { ok: true, waMessageId };
}

async function runNotifyOwner(run: RunRow, leadId: string, current: FlowStep): Promise<void> {
  const [lead] = await db
    .select({
      studentName: leads.studentName,
      leadNumber: leads.leadNumber,
      assignedTo: leads.assignedTo,
      centerId: leads.centerId,
    })
    .from(leads)
    .where(eq(leads.id, leadId));
  const message = String((current.config as { message?: unknown }).message ?? "").trim();
  if (!lead) return;
  await notify({
    eventKey: "flow.step_reached",
    context: {
      lead_name: lead.studentName,
      lead_number: lead.leadNumber ?? "",
      message: message || describeStep(current),
    },
    href: `/leads/${leadId}`,
    entityType: "leads",
    entityId: leadId,
    centerId: lead.centerId,
    ownerId: lead.assignedTo,
  });
  await logEvent(run.id, current.id, "notified", message || null);
}

/**
 * Walks one run forward until it has to stop and wait.
 *
 * Capped at MAX_STEPS_PER_ADVANCE: branches may jump backwards, so a
 * flow can be written as a loop, and a loop with no wait in it would
 * otherwise spin inside a single request.
 */
async function runOne(run: RunRow, steps: FlowStep[]): Promise<void> {
  let current = run.currentStepId
    ? (steps.find((step) => step.id === run.currentStepId) ?? null)
    : firstStep(steps);

  // A run whose current step was deleted mid-flight ends quietly rather
  // than guessing where it was.
  if (!current) {
    await endRun(
      run.id,
      "completed",
      run.currentStepId ? "Its step was removed." : "Nothing to do.",
    );
    return;
  }

  for (let executed = 0; executed < MAX_STEPS_PER_ADVANCE; executed += 1) {
    if (!current) {
      await endRun(run.id, "completed", "Reached the end.");
      return;
    }

    /*
      Tags were removed from the CRM. A flow written while they existed may
      still have a "put a tag on them" step; it is skipped rather than
      stopping the run, so the messages after it still go out.
    */
    if ((current.kind as string) === "add_tag") {
      await logEvent(run.id, current.id, "skipped", "Tags no longer exist, so this step did nothing.");
      current = nextStep(steps, current.position);
      continue;
    }

    switch (current.kind) {
      case "send_template": {
        let outcome;
        try {
          outcome = await sendStep(current, { leadId: run.leadId, contactId: run.contactId });
        } catch (error) {
          // Meta refused it. Recorded, not retried — the same template
          // will be refused identically tomorrow and every attempt costs
          // money. See the payment reminder sweep for the same call.
          const message = error instanceof Error ? error.message : String(error);
          await logEvent(run.id, current.id, "failed", message);
          await endRun(run.id, "failed", message);
          return;
        }
        if (!outcome.ok) {
          await logEvent(run.id, current.id, outcome.fatal ? "stopped" : "waited", outcome.reason);
          if (outcome.fatal) {
            await endRun(run.id, "stopped", outcome.reason);
          } else {
            // Try again on the next sweep — the number may be connected by then.
            await db
              .update(whatsappFlowRuns)
              .set({
                currentStepId: current.id,
                wakeAt: new Date(Date.now() + 86_400_000),
                updatedAt: new Date(),
              })
              .where(eq(whatsappFlowRuns.id, run.id));
          }
          return;
        }
        await logEvent(run.id, current.id, "sent", describeStep(current));
        current = nextStep(steps, current.position);
        break;
      }

      case "wait": {
        await db
          .update(whatsappFlowRuns)
          .set({
            status: "waiting",
            currentStepId: current.id,
            awaitingStepId: null,
            wakeAt: new Date(Date.now() + waitMs(current)),
            updatedAt: new Date(),
          })
          .where(eq(whatsappFlowRuns.id, run.id));
        await logEvent(run.id, current.id, "waited", describeStep(current));
        // The step is marked done by the fact that the NEXT wake moves
        // past it — see advanceRuns, which resumes at the step after a
        // completed wait.
        await db
          .update(whatsappFlowRuns)
          .set({ currentStepId: nextStep(steps, current.position)?.id ?? null })
          .where(eq(whatsappFlowRuns.id, run.id));
        return;
      }

      case "wait_for_reply": {
        const config = waitConfig(current);
        await db
          .update(whatsappFlowRuns)
          .set({
            status: "waiting",
            currentStepId: current.id,
            awaitingStepId: current.id,
            wakeAt: new Date(Date.now() + config.hours * 3_600_000),
            updatedAt: new Date(),
          })
          .where(eq(whatsappFlowRuns.id, run.id));
        await logEvent(run.id, current.id, "waited", describeStep(current));
        return;
      }

      case "set_temperature":
      case "notify_owner": {
        // Both act on a lead. A contact has no temperature and no owner, so
        // the step is skipped and the messages after it still go out.
        if (!run.leadId) {
          await logEvent(run.id, current.id, "skipped", "Only applies to leads, so it did nothing here.");
          current = nextStep(steps, current.position);
          break;
        }
        if (current.kind === "notify_owner") {
          await runNotifyOwner(run, run.leadId, current);
          current = nextStep(steps, current.position);
          break;
        }
        const temperature = (current.config as { temperature?: unknown }).temperature;
        if (typeof temperature === "string" && temperature) {
          /*
            The database refuses a move this automation is not allowed to
            make — into Took admission (no admission), or into a closing
            outcome that needs a reason an automation cannot give. The
            editor only offers statuses that are safe, so reaching that
            refusal means somebody changed what a status IS after the step
            was written. The run records it and carries on rather than
            dying: the later steps (a message, a tag) are still correct.
          */
          try {
            await db
              .update(leads)
              .set({ temperature, temperatureOverrideUntil: null, temperatureSetBy: "system", updatedAt: new Date() })
              .where(eq(leads.id, run.leadId));
            await logEvent(run.id, current.id, "staged", null);
          } catch (error) {
            await logEvent(
              run.id,
              current.id,
              "failed",
              error instanceof Error ? error.message : "Could not change the temperature",
            );
          }
        }
        current = nextStep(steps, current.position);
        break;
      }

      case "stop": {
        await logEvent(run.id, current.id, "stopped", "Reached a stop step.");
        await endRun(run.id, "completed", "Reached a stop step.");
        return;
      }
    }
  }

  // Twenty steps without hitting a wait means the flow loops. Stopping
  // is the safe answer: the alternative is a person's phone buzzing
  // twenty times.
  await logEvent(run.id, null, "failed", "This flow loops without waiting.");
  await endRun(run.id, "failed", "This flow loops without waiting.");
}

/**
 * The sweep. Every run whose wait is over, moved forward.
 *
 * A run parked on `wait_for_reply` whose time is up takes its timeout
 * branch here — which is how "no answer in two days → try again" works
 * without anybody having to reply.
 */
export async function advanceRuns(): Promise<{ advanced: number }> {
  const due = await db
    .select({
      id: whatsappFlowRuns.id,
      flowId: whatsappFlowRuns.flowId,
      leadId: whatsappFlowRuns.leadId,
      contactId: whatsappFlowRuns.contactId,
      currentStepId: whatsappFlowRuns.currentStepId,
      awaitingStepId: whatsappFlowRuns.awaitingStepId,
    })
    .from(whatsappFlowRuns)
    .where(
      and(
        inArray(whatsappFlowRuns.status, ["running", "waiting"]),
        lte(whatsappFlowRuns.wakeAt, new Date()),
      ),
    )
    .limit(RUNS_PER_SWEEP);

  const stepCache = new Map<string, FlowStep[]>();
  let advanced = 0;

  for (const run of due) {
    let steps = stepCache.get(run.flowId);
    if (!steps) {
      steps = await stepsFor(run.flowId);
      stepCache.set(run.flowId, steps);
    }

    if (run.awaitingStepId) {
      // Nobody replied in time. Take the timeout branch.
      const parked = steps.find((step) => step.id === run.awaitingStepId);
      if (!parked) {
        await endRun(run.id, "completed", "Its step was removed.");
        continue;
      }
      const target = resolveGoto(steps, parked.position, waitConfig(parked).onTimeout ?? "next");
      await logEvent(run.id, parked.id, "timed_out", "No reply in time.");
      await db
        .update(whatsappFlowRuns)
        .set({
          status: "running",
          awaitingStepId: null,
          currentStepId: target?.id ?? null,
          wakeAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(whatsappFlowRuns.id, run.id));
      if (!target) {
        await endRun(run.id, "completed", "No reply, and nothing after it.");
        continue;
      }
      await runOne({ ...run, currentStepId: target.id }, steps);
      advanced += 1;
      continue;
    }

    await db
      .update(whatsappFlowRuns)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(whatsappFlowRuns.id, run.id));
    await runOne(run, steps);
    advanced += 1;
  }

  return { advanced };
}

/**
 * A lead replied. Any run waiting on them branches on what they said.
 *
 * Called from the inbound webhook, so a quick-reply button tap moves the
 * conversation within seconds rather than at the next sweep — which is
 * the whole point of buttons.
 *
 * Never throws into the webhook: a broken flow must not stop a message
 * being recorded.
 */
export async function resolveReply(leadId: string, text: string | null): Promise<number> {
  return resolveWaiting(eq(whatsappFlowRuns.leadId, leadId), text);
}

/**
 * A database contact replied (the number matched no lead). Same branching as
 * for a lead; the contact is found by phone, since the reply carries nothing else.
 */
export async function resolveContactReply(phone: string, text: string | null): Promise<number> {
  try {
    const normalised = normalizePhone(phone) ?? phone;
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.phone, normalised), isNull(contacts.deletedAt)));
    if (!contact) return 0;
    return resolveWaiting(eq(whatsappFlowRuns.contactId, contact.id), text);
  } catch {
    return 0;
  }
}

/**
 * Enrols the people on these lists into a contact flow.
 *
 * Only lists marked as having agreed to WhatsApp, only people who are not
 * leads and not opted out: the same rules a broadcast to the database applies,
 * and checked again before every send. Anyone already partway through is left
 * alone (the unique live-run index). Returns how many started and how many
 * were left out.
 */
export async function startFlowForContacts(
  flowId: string,
  listIds: string[],
): Promise<{ started: number; skipped: number }> {
  if (listIds.length === 0) return { started: 0, skipped: 0 };
  const members = await db
    .selectDistinct({ contactId: contactListMembers.contactId })
    .from(contactListMembers)
    .where(inArray(contactListMembers.listId, listIds));
  const ids = members.map((m) => m.contactId);

  let started = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const eligible = [...(await messageableContactIds(chunk))];
    if (eligible.length === 0) continue;
    const phones = await db
      .select({ id: contacts.id, phone: contacts.phone })
      .from(contacts)
      .where(inArray(contacts.id, eligible));
    const suppressed = await suppressedAmong(
      db,
      phones.flatMap((p) => (p.phone ? [p.phone] : [])),
    );
    const go = phones.filter((p) => p.phone && !suppressed.has(p.phone)).map((p) => p.id);
    if (go.length === 0) continue;
    const created = await db
      .insert(whatsappFlowRuns)
      .values(go.map((contactId) => ({ flowId, contactId, status: "running", wakeAt: new Date() })))
      .onConflictDoNothing()
      .returning({ id: whatsappFlowRuns.id });
    for (const run of created) await logEvent(run.id, null, "started", "Started for a database list");
    started += created.length;
  }
  return { started, skipped: ids.length - started };
}

async function resolveWaiting(subject: ReturnType<typeof eq>, text: string | null): Promise<number> {
  try {
    const waiting = await db
      .select({
        id: whatsappFlowRuns.id,
        flowId: whatsappFlowRuns.flowId,
        leadId: whatsappFlowRuns.leadId,
        contactId: whatsappFlowRuns.contactId,
        awaitingStepId: whatsappFlowRuns.awaitingStepId,
      })
      .from(whatsappFlowRuns)
      .where(
        and(
          subject,
          inArray(whatsappFlowRuns.status, ["running", "waiting"]),
          sql`${whatsappFlowRuns.awaitingStepId} is not null`,
        ),
      );

    let moved = 0;
    for (const run of waiting) {
      const steps = await stepsFor(run.flowId);
      const parked = run.awaitingStepId
        ? stepAt(steps, steps.find((s) => s.id === run.awaitingStepId)?.position ?? -1)
        : null;
      if (!parked) continue;

      const config = waitConfig(parked);
      const branch = matchBranch(text, config.branches);
      const goto = branch ? branch.goto : (config.onOther ?? "next");
      const target = resolveGoto(steps, parked.position, goto);

      await logEvent(
        run.id,
        parked.id,
        "replied",
        branch ? `"${text ?? ""}" → ${branch.match}` : `"${text ?? ""}" matched nothing`,
      );

      if (!target) {
        await endRun(
          run.id,
          "completed",
          branch ? `Replied "${branch.match}".` : "Replied, and nothing after it.",
        );
        moved += 1;
        continue;
      }

      await db
        .update(whatsappFlowRuns)
        .set({
          status: "running",
          awaitingStepId: null,
          currentStepId: target.id,
          wakeAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(whatsappFlowRuns.id, run.id));
      await runOne(
        { id: run.id, flowId: run.flowId, leadId: run.leadId, contactId: run.contactId, currentStepId: target.id },
        steps,
      );
      moved += 1;
    }
    return moved;
  } catch {
    return 0;
  }
}
