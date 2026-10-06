"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { batches, enrolments, leadIdentifiers, leads } from "@/lib/db/schema";
import { confirmAdmission } from "@/lib/enrolment/confirm-admission";
import { resolveDiscount } from "@/lib/enrolment/discount-authority";
import { getDiscountLimit } from "@/lib/enrolment/get-discount-limit";
import { fieldColumn } from "@/lib/fields/field-column";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { NOT_PROVIDED, parseFieldValue } from "@/lib/fields/parse-field-value";
import { captureError } from "@/lib/errors/capture";
import { isFrameworkControlFlow } from "@/lib/errors/request-error";
import { parseRupeesToPaise } from "@/lib/format/currency";
import { needsFollowUp } from "@/lib/leads/interaction-follow-up";
import { temperatureOverrideFor } from "@/lib/leads/temperature-override";
import { notify } from "@/lib/notifications/notify";
import { startFlows } from "@/lib/whatsapp/flow-runner";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  success?: string;
}

/**
 * Every editable field the schema knows about, written through one path —
 * a core field to its real column, a custom one merged into `custom`
 * jsonb. Phone-type fields are never handled here regardless of their
 * is_editable flag: editing a lead's phone needs to also update
 * lead_identifiers (the dedup index), which is a dedicated flow this
 * session doesn't build — see docs/DECISIONS.md.
 */
export async function updateLead(leadId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.update")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const fields = await getFieldSchema(supabase, "lead", user);

  const { data: existing, error: readError } = await supabase
    .from("leads")
    .select("custom, temperature, primary_phone")
    .eq("id", leadId)
    .maybeSingle<{
      custom: Record<string, unknown> | null;
      temperature: string | null;
      primary_phone: string | null;
    }>();

  // A transient read failure here must not fall through to `?? {}` below —
  // that would make the update at the end of this function overwrite the
  // lead's entire `custom` jsonb with only this form's fields, silently
  // discarding every other custom value the lead already had.
  if (readError) {
    return { error: `Could not load current field values: ${readError.message}` };
  }

  const coreUpdates: Record<string, unknown> = {};
  const customUpdates: Record<string, unknown> = { ...(existing?.custom ?? {}) };
  let touchedCustom = false;

  /*
    Phone numbers used to be skipped outright here, and rendered as a
    read-only reveal button on the form — so no number on a lead could be
    corrected, ever. A counsellor who took down a digit wrong had to
    delete the lead and start again, and alternate and parent numbers
    could be captured at intake and never afterwards.

    They are editable now, but only by somebody who may reveal them. That
    is not an extra rule so much as the only coherent one: the form shows
    a masked number until it is revealed, and letting somebody overwrite a
    value they are not allowed to see is how a number gets replaced by
    accident with nobody able to tell what it used to be.
  */
  const canEditPhones = can(user, "lead.reveal_phone");

  for (const field of fields) {
    if (!field.isEditable) continue;
    if (field.type === "phone" && !canEditPhones) continue;

    // One typed parse for every field type, shared with the public
    // student form — see lib/fields/parse-field-value.ts. It replaces a
    // hand-rolled coercion that turned "next year" into NaN and stored
    // it (security audit 2026-09-15, finding #6).
    const raw =
      field.type === "multiselect"
        ? formData.getAll(field.key).map(String)
        : (formData.get(field.key) as string | null);

    const parsed = parseFieldValue(field, raw);
    if (!parsed.ok) return { error: parsed.message };
    if (parsed.value === NOT_PROVIDED) continue; // not rendered in this form at all
    const value = parsed.value;

    if (field.isCore) {
      coreUpdates[fieldColumn(field.key)] = value;
    } else {
      customUpdates[field.key] = value;
      touchedCustom = true;
    }
  }

  // The picker never offers the lead itself, but the value posts as a
  // plain uuid and the column would take it — a self-referral would then
  // count as a referral in the report and point the graph at a loop.
  if (coreUpdates.referred_by_lead_id === leadId) {
    return { error: "A lead can't be their own referrer." };
  }

  // A human changing `temperature` here is exactly the "counsellor's manual
  // judgement" docs/01-DATA-MODEL.md § Temperature describes — it must beat
  // the recompute cron for a configurable number of days, or the cron would
  // silently overwrite this edit on its very next run. Only stamped on a
  // genuine change (not a same-value re-submit of the whole form) so an
  // unrelated field edit doesn't keep resetting the override window.
  if ("temperature" in coreUpdates && coreUpdates.temperature !== existing?.temperature) {
    Object.assign(coreUpdates, await temperatureOverrideFor(supabase, user.id));
  }

  /*
    Changing the primary phone changes the lead's identity.

    `lead_identifiers` is the dedup index: it is what every webhook, the
    importer and manual entry are matched against. Updating `leads` alone
    would leave the index pointing at the old number, so the next enquiry
    from the corrected number would create a second lead for the same
    person, while the wrong number went on claiming them — the exact
    duplicate non-negotiable #2 exists to prevent, created by fixing a
    typo.

    The check runs on the direct client because the question is "does any
    live lead hold this number", and a counsellor cannot see the leads
    that would answer it. The write goes through the RLS client, where
    `lead_identifiers_update` enforces the boundary (migration 0005).
  */
  const nextPrimary = coreUpdates.primary_phone;
  const primaryChanged =
    typeof nextPrimary === "string" && nextPrimary !== (existing?.primary_phone ?? null);

  if (primaryChanged) {
    const [taken] = await db
      .select({ leadId: leadIdentifiers.leadId })
      .from(leadIdentifiers)
      .innerJoin(leads, eq(leads.id, leadIdentifiers.leadId))
      .where(
        and(
          eq(leadIdentifiers.kind, "phone"),
          eq(leadIdentifiers.valueNormalised, nextPrimary as string),
          isNull(leadIdentifiers.deletedAt),
          isNull(leads.deletedAt),
        ),
      );

    // Deliberately refused rather than merged. Non-negotiable #2 is about
    // never rejecting an incoming enquiry; this is somebody retyping a
    // number in an edit box, and silently folding two leads together
    // because of it would be the most surprising thing this CRM could do.
    if (taken && taken.leadId !== leadId) {
      return {
        error:
          "Another lead already has that phone number. If they are the same person, merge them — that keeps both histories.",
      };
    }
  }

  const payload = touchedCustom ? { ...coreUpdates, custom: customUpdates } : coreUpdates;
  const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
  if (error) {
    return { error: error.message };
  }

  if (primaryChanged) {
    const { error: identifierError } = await supabase
      .from("lead_identifiers")
      .update({ value_normalised: nextPrimary as string, updated_at: new Date().toISOString() })
      .eq("lead_id", leadId)
      .eq("kind", "phone")
      .eq("value_normalised", existing?.primary_phone ?? "")
      .is("deleted_at", null);

    if (identifierError) {
      // The lead carries the new number and the index still carries the
      // old one. Said plainly, because the symptom otherwise shows up
      // weeks later as a duplicate nobody can explain.
      return {
        error:
          "The number was changed on the lead, but the duplicate-matching index could not be updated, so a new enquiry from this number may create a second lead. Tell an administrator before using it.",
      };
    }
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.update",
    entityType: "leads",
    entityId: leadId,
    after: payload,
  });

  revalidatePath(`/leads/${leadId}`);
  return { success: "Saved." };
}

const interactionSchema = {
  type: (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v : null),
  nextAction: (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null),
};

/**
 * CLAUDE.md/docs/02-BUILD-PHASES.md: "mandatory next action on every
 * interaction log." Enforced here in application code AND at the database
 * level (the CHECK constraint on `interactions` — see migration 0009) so
 * neither this form nor any future caller can skip it.
 */
export async function logInteraction(leadId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "interaction.create")) {
    return { error: "You don't have permission to do that." };
  }

  const type = interactionSchema.type(formData.get("type"));
  const nextAction = interactionSchema.nextAction(formData.get("nextAction"));
  if (!type) return { error: "Interaction type is required." };

  const direction = formData.get("direction");
  const outcome = formData.get("outcome");
  const notes = formData.get("notes");
  const durationRaw = formData.get("durationSeconds");
  const nextFollowupAtRaw = formData.get("nextFollowupAt");

  /*
    An interaction has to say what happens next, and when.

    The date is the half that was optional, and it is the half that
    matters: a next action with no date is a sentence nobody will ever be
    shown again. Nothing surfaces the lead in the morning queue, no SLA
    counts against it, and it is found months later in a list of leads
    that were quietly abandoned mid-conversation.

    Unless the conversation is over because they joined — see
    `needsFollowUp()` for why that one outcome is exempt and why it is
    keyed on the row's value rather than its label.
  */
  const followUpRequired = needsFollowUp(typeof outcome === "string" ? outcome : null);
  if (followUpRequired && !nextAction) {
    return { error: "Next action is required — say what happens next, however small." };
  }
  if (followUpRequired && !nextFollowupAtRaw) {
    return {
      error: "A date for the next action is required, so this lead comes back to somebody.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interactions")
    .insert({
      lead_id: leadId,
      type,
      direction: direction || null,
      outcome: outcome || null,
      notes: notes || null,
      duration_seconds: durationRaw ? Number(durationRaw) : null,
      next_action: nextAction,
      next_followup_at: nextFollowupAtRaw || null,
      created_by: user.id,
      source: "manual",
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  // The interaction log's own next_followup_at is the counsellor's stated
  // plan — mirror it onto the lead so "My Day" (Phase 2) and the list can
  // surface it without joining interactions.
  if (nextFollowupAtRaw) {
    await supabase.from("leads").update({ next_followup_at: nextFollowupAtRaw }).eq("id", leadId);
  }

  const nowIso = new Date().toISOString();

  // last_activity_at updates on every interaction — unlike first_response_at
  // below, there's no "only the first time" gate here.
  await supabase.from("leads").update({ last_activity_at: nowIso }).eq("id", leadId);

  // Stamp first_response_at the first time any interaction is logged for
  // this lead — the SLA sweep's `first_response` measure has nothing to
  // count from until this exists (docs/01-DATA-MODEL.md § SLA policies).
  // The `.is(...)` filter makes this a no-op on every later interaction:
  // once responded, this is set for good.
  await supabase
    .from("leads")
    .update({ first_response_at: nowIso })
    .eq("id", leadId)
    .is("first_response_at", null);

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "interaction.create",
    entityType: "interactions",
    entityId: data.id,
    after: { type, outcome, nextAction },
  });

  revalidatePath(`/leads/${leadId}`);
  return { success: "Interaction logged." };
}

export async function createTask(leadId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "interaction.create")) {
    return { error: "You don't have permission to do that." };
  }

  const title = formData.get("title");
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Task title is required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      lead_id: leadId,
      title: title.trim(),
      type: formData.get("type") || null,
      due_at: formData.get("dueAt") || null,
      assigned_to: (formData.get("assignedTo") as string) || user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  // Security audit 2026-09-15, finding #8. Tasks were the one mutation
  // path with no audit row, against non-negotiable #5's "every mutation".
  // A task carries a name and a follow-up commitment, and who assigned
  // what to whom is exactly the kind of thing an argument later turns on.
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "task.create",
    entityType: "tasks",
    entityId: data.id,
    after: {
      leadId,
      title: title.trim(),
      assignedTo: (formData.get("assignedTo") as string) || user.id,
      dueAt: formData.get("dueAt") || null,
    },
  });

  revalidatePath(`/leads/${leadId}`);
  return { success: "Task added." };
}

export async function completeTask(taskId: string, leadId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "interaction.create")) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString(), completed_by: user.id })
    .eq("id", taskId);

  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "task.complete",
    entityType: "tasks",
    entityId: taskId,
    after: { leadId, status: "done" },
  });

  revalidatePath(`/leads/${leadId}`);
}

/**
 * Gate 1 (sales -> accounts). confirmAdmission() runs on the direct db
 * client (see its own doc comment), so — same pattern as
 * confirmMerge()/createLeadManually() — this action is the enforcement
 * point: re-implements the own/center/all scope check `can_access_center()`
 * would apply, checked against the lead before ever touching the database.
 */
/**
 * Confirming an admission, with a failure that stays inside the form.
 *
 * On 3 October 2026 this threw on `select * from leads` — production was
 * missing a column — and the counsellor lost the entire screen to a blank
 * page and an eight-digit number. An unhandled throw in a Server Action
 * takes out the nearest error boundary, which here is the whole lead.
 *
 * That is the wrong failure mode for a save. The admission either happens
 * or it does not; either way the counsellor should still be looking at the
 * lead, with the student in front of them, able to try something else. So
 * anything unexpected is reported and turned into a message on the form.
 *
 * Reported with `await`, deliberately: on Vercel a serverless function can
 * be frozen the moment its response is sent, so reporting that is not
 * finished before the action returns may never be written at all. That is
 * why this is here and not left to `instrumentation.ts`, which runs after
 * the response has gone.
 */
export async function confirmAdmissionAction(
  leadId: string,
  prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    return await runConfirmAdmission(leadId, prevState, formData);
  } catch (error) {
    // redirect() and notFound() are implemented as throws and must keep
    // travelling. Nothing here uses them today; swallowing one silently if
    // something later does would be a bad afternoon.
    if (isFrameworkControlFlow(error)) throw error;

    await captureError({
      source: "action:confirmAdmission",
      error,
      // The lead id, not the form: a fee, a discount and a student's course
      // are not things to copy into an error table.
      context: { leadId },
    });

    return {
      error:
        "Something went wrong saving this admission, and it has been reported. Nothing was recorded — the lead is unchanged. Please try again, and tell Leon if it keeps happening.",
    };
  }
}

async function runConfirmAdmission(
  leadId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "enrolment.create")) {
    return { error: "You don't have permission to do that." };
  }
  const scope = scopeFor(user, "enrolment.create");
  if (!scope) {
    return { error: "You don't have permission to do that." };
  }

  const course = formData.get("course");
  const mode = formData.get("mode");
  const academicYear = formData.get("academicYear");
  if (typeof course !== "string" || !course) return { error: "Course is required." };
  if (typeof mode !== "string" || !mode) return { error: "Mode is required." };
  if (typeof academicYear !== "string" || !academicYear.trim()) {
    return { error: "Academic year is required." };
  }

  const batchIdRaw = formData.get("batchId");
  const batchId = typeof batchIdRaw === "string" && batchIdRaw.trim() !== "" ? batchIdRaw.trim() : null;

  const discountPaise = parseRupeesToPaise(formData.get("discount")) ?? 0;
  const feeOverrideRaw = formData.get("totalFeeOverride");
  const totalFeePaiseOverride =
    typeof feeOverrideRaw === "string" && feeOverrideRaw.trim() !== "" ? parseRupeesToPaise(feeOverrideRaw) : null;
  if (typeof feeOverrideRaw === "string" && feeOverrideRaw.trim() !== "" && totalFeePaiseOverride === null) {
    return { error: "Manual fee override must be a valid amount." };
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead || lead.deletedAt) {
    return { error: "This lead no longer exists." };
  }
  if (scope === "own" && lead.assignedTo !== user.id) {
    return { error: "This lead is outside your access." };
  }
  if (scope === "center" && (!lead.centerId || !user.centerIds.includes(lead.centerId))) {
    return { error: "This lead is outside your access." };
  }
  if (!lead.centerId) {
    return { error: "This lead has no centre assigned yet — set one before confirming admission." };
  }

  // The picker only offers batches at this centre running this course, but a
  // posted form is not the picker: an id could be stale (the batch was
  // deactivated while the form sat open) or simply wrong. Checked here rather
  // than trusted, because a wrong batch is invisible afterwards — the
  // enrolment looks complete either way.
  if (batchId) {
    const [batch] = await db
      .select({ centerId: batches.centerId, course: batches.course, isActive: batches.isActive })
      .from(batches)
      .where(and(eq(batches.id, batchId), isNull(batches.deletedAt)));

    if (!batch || !batch.isActive) {
      return { error: "That batch is no longer available — pick another." };
    }
    if (batch.centerId !== lead.centerId) {
      return { error: "That batch is at a different centre." };
    }
    if (batch.course !== course) {
      return { error: `That batch runs ${batch.course}, not ${course}.` };
    }
  }

  // The same authority check the fee panel applies. Confirming an
  // admission is the OTHER way a discount gets set, and leaving it open
  // would make the whole limit theatre: type the figure here instead.
  // There is no approved discount to fall back on yet, so anything above
  // the confirmer's ceiling is simply not applied and waits.
  const discountOutcome = resolveDiscount({
    limit: await getDiscountLimit(user),
    totalFeePaise: totalFeePaiseOverride ?? 0,
    requestedPaise: discountPaise,
    alreadyApprovedPaise: 0,
  });

  let result;
  try {
    result = await db.transaction(async (tx) => {
      const confirmed = await confirmAdmission(tx, {
        leadId,
        course,
        batchId,
        centerId: lead.centerId!,
        mode,
        academicYear: academicYear.trim(),
        totalFeePaiseOverride,
        discountPaise: discountOutcome.appliedDiscountPaise,
        confirmedBy: user.id,
      });

      if (discountOutcome.pendingDiscountPaise !== null) {
        // Re-checked against the fee confirmAdmission actually resolved,
        // which may have come from fee_structures rather than the form —
        // a percentage limit is meaningless against a fee of zero.
        const recheck = resolveDiscount({
          limit: await getDiscountLimit(user),
          totalFeePaise: confirmed.totalFeePaise,
          requestedPaise: discountPaise,
          alreadyApprovedPaise: 0,
        });
        if (recheck.needsApproval) {
          await tx
            .update(enrolments)
            .set({
              pendingDiscountPaise: recheck.pendingDiscountPaise,
              pendingDiscountBy: user.id,
              pendingDiscountAt: new Date(),
            })
            .where(eq(enrolments.id, confirmed.enrolmentId));
        } else {
          // Within authority after all once the real fee was known.
          await tx
            .update(enrolments)
            .set({
              discountPaise: recheck.appliedDiscountPaise,
              netFeePaise: confirmed.totalFeePaise - recheck.appliedDiscountPaise,
            })
            .where(eq(enrolments.id, confirmed.enrolmentId));
        }
      }

      return confirmed;
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not confirm admission." };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "enrolment.create",
    entityType: "enrolments",
    entityId: result.enrolmentId,
    after: { leadId, course, mode, academicYear: academicYear.trim(), netFeePaise: result.netFeePaise },
  });

  // Accounts has work now, and until this existed they found out by
  // refreshing a page. Notified after the transaction committed, so the
  // message can never describe an admission that was rolled back.
  await notify({
    eventKey: "admission.confirmed",
    context: {
      lead_name: lead.studentName,
      lead_number: lead.leadNumber,
      course,
      counsellor_name: user.fullName,
    },
    href: `/accounts/${result.enrolmentId}`,
    entityType: "enrolments",
    entityId: result.enrolmentId,
    centerId: lead.centerId,
    ownerId: lead.assignedTo,
    actorId: user.id,
  });

  /*
    The stage move is part of confirming an admission, and until now it
    was the only part that left no trace.

    `confirmAdmission()` moves the lead into the stage marked Won, inside
    the same transaction. But it wrote no audit row, so the lead's own
    history showed an enrolment appearing and the stage changing by
    itself; and it started no automations, so a sequence set up to fire on
    "entered Admission Confirmed" never fired for the one event that
    actually puts a lead there. Both are done here, after the commit, for
    the same reason the notification is: they must describe an admission
    that really happened.
  */
  if (result.wonStageId) {
    await writeAuditLog(supabase, {
      actorId: user.id,
      action: "lead.stage_change",
      entityType: "leads",
      entityId: leadId,
      before: { stage_id: lead.stageId },
      after: { stage_id: result.wonStageId, reason: "admission confirmed" },
    });

    await startFlows("stage_entered", { leadId, stageId: result.wonStageId });
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");

  // Said plainly when it could not happen. An admission is recorded
  // either way — refusing it over a pipeline setting would be absurd —
  // but a counsellor who is not told will keep moving the lead by hand
  // forever, and an administrator will never learn that one stage needs
  // its type set.
  return result.wonStageId
    ? { success: "Admission confirmed, and the lead moved to the admission stage." }
    : {
        success:
          "Admission confirmed. The lead's stage was left as it was: no pipeline stage is marked as the admission stage, so there was nowhere to move it to. An admin can set one under Settings → Pipeline Stages by giving that stage the type \"Won\".",
      };
}

/**
 * Applying/removing a tag is treated as a lead edit — gated on lead.update,
 * same permission the rest of this file's mutations use, rather than a new
 * primitive (lead_tags' own RLS insert/delete policies check the same
 * thing, so this is defence in depth, not the only check).
 */
export async function addLeadTag(leadId: string, tagId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.update")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("lead_tags").insert({ lead_id: leadId, tag_id: tagId, tagged_by: user.id });
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.tag_add",
    entityType: "leads",
    entityId: leadId,
    after: { tagId },
  });

  // A tag is how a counsellor says "this one is interested in NIFT" —
  // which is exactly the moment an institute wants a sequence to start.
  await startFlows("tag_added", { leadId, tagId });

  revalidatePath(`/leads/${leadId}`);
}

export async function removeLeadTag(leadId: string, tagId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.update")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("lead_tags").delete().eq("lead_id", leadId).eq("tag_id", tagId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.tag_remove",
    entityType: "leads",
    entityId: leadId,
    after: { tagId },
  });

  revalidatePath(`/leads/${leadId}`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deleting a lead.
 *
 * `lead.delete` has been a permission since Phase 1 with nothing behind it:
 * there was no way to get a junk lead — a test row, a spam form fill, the
 * same person entered twice by two counsellors — out of the pipeline short
 * of marking it Lost, which is a lie about a real enquiry and pollutes
 * every conversion number from then on.
 *
 * Soft, always (CLAUDE.md non-negotiable #5). A lead is the root of its
 * enquiries, interactions, tasks, files and audit trail, so removing the
 * row would remove the record of a person the institute talked to. The row
 * stays, `deleted_at` hides it from every list, and an admin can restore it.
 * Migration 0074 drops the DELETE policy that used to exist, so there is no
 * hard-delete path left to reach by accident.
 *
 * A reason is required. The question somebody asks three months later is
 * never "was this deleted" — the row says that — but "why", and nobody
 * remembers. The merge path is the better tool for a duplicate and says so
 * in the refusal below.
 *
 * Runs on the direct client, like every other write in this file, so the
 * scope check is re-implemented here. The database also enforces the
 * primitive itself through the trigger in 0074, which is what makes this
 * more than a politeness.
 */
export async function deleteLead(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.delete")) {
    return { error: "You don't have permission to delete a lead." };
  }
  const scope = scopeFor(user, "lead.delete");
  if (!scope) return { error: "You don't have permission to delete a lead." };

  const leadId = String(formData.get("leadId") ?? "");
  if (!UUID.test(leadId)) return { error: "That is not a lead." };

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) {
    return { error: "Say why you are deleting this lead — somebody will ask." };
  }
  if (reason.length > 500) return { error: "Keep the reason under 500 characters." };

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)));
  if (!lead) return { error: "That lead does not exist, or is already deleted." };

  if (scope === "center" && !user.centerIds.includes(lead.centerId ?? "")) {
    return { error: "That lead is not at your centre." };
  }
  if (scope === "own" && lead.assignedTo !== user.id) {
    return { error: "That lead is not yours." };
  }

  /*
    A confirmed admission is money and an obligation, not a lead any more.
    Deleting it would hide an enrolment accounts is still collecting
    against, so it is refused rather than cascaded.

    `droppedAt` has to be in this test as well as `deletedAt`. Dropping an
    admission records a drop — it does not soft-delete the row, because
    the enrolment is still the history of what was agreed and what was
    paid. So a lead whose admission had been dropped stayed undeletable
    for ever, while the refusal told them to "drop the admission first if
    it is not going ahead", which they had already done. The one thing a
    person is told to do to get past a block has to actually get them past
    it.
  */
  const [enrolment] = await db
    .select({ id: enrolments.id })
    .from(enrolments)
    .where(
      and(
        eq(enrolments.leadId, leadId),
        isNull(enrolments.deletedAt),
        isNull(enrolments.droppedAt),
      ),
    );
  if (enrolment) {
    return {
      error:
        "This lead has a confirmed admission, so it cannot be deleted. Drop the admission first if it is not going ahead.",
    };
  }

  const deletedAt = new Date();

  await db
    .update(leads)
    .set({
      deletedAt,
      deletedBy: user.id,
      deletedReason: reason,
      updatedAt: deletedAt,
    })
    .where(eq(leads.id, leadId));

  /*
    The dedup index has to go with it.

    `lead_identifiers_kind_value_uq` is partial on `deleted_at is null`,
    so a surviving identifier keeps that phone number reserved by a lead
    nobody can see. Entering the number again then resolved to the deleted
    lead and the new enquiry vanished into it — or, once resolution learnt
    to skip deleted leads, collided with the orphaned identifier instead.
    Either way the number was unusable for ever, which is not what anybody
    means by deleting a lead.
  */
  await db
    .update(leadIdentifiers)
    .set({ deletedAt, updatedAt: deletedAt })
    .where(and(eq(leadIdentifiers.leadId, leadId), isNull(leadIdentifiers.deletedAt)));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.delete",
    entityType: "leads",
    entityId: leadId,
    before: { studentName: lead.studentName, stageId: lead.stageId, assignedTo: lead.assignedTo },
    after: { deletedReason: reason },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
  redirect("/leads?deleted=1");
}

/**
 * Putting one back.
 *
 * The counterpart to the above, and the reason a soft delete is worth
 * having at all: a lead deleted in error is recoverable, which is not true
 * of a row that is gone. Restoring clears the reason too — keeping a stale
 * "duplicate of 4821" on a live lead would be worse than keeping nothing,
 * and the audit log holds the history either way.
 */
export async function restoreLead(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.delete")) {
    return { error: "You don't have permission to restore a lead." };
  }
  const scope = scopeFor(user, "lead.delete");
  if (!scope) return { error: "You don't have permission to restore a lead." };

  const leadId = String(formData.get("leadId") ?? "");
  if (!UUID.test(leadId)) return { error: "That is not a lead." };

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead || !lead.deletedAt) return { error: "That lead is not deleted." };

  if (scope === "center" && !user.centerIds.includes(lead.centerId ?? "")) {
    return { error: "That lead is not at your centre." };
  }
  if (scope === "own" && lead.assignedTo !== user.id) {
    return { error: "That lead is not yours." };
  }

  // A lead that was merged away is a different case: restoring it would put
  // a second copy of one person back in the pipeline, which is the exact
  // thing the merge fixed. Unmerging is its own job and does not exist yet.
  if (lead.mergedIntoLeadId) {
    return {
      error: "This lead was merged into another one, so it cannot be restored here.",
    };
  }

  await db
    .update(leads)
    .set({ deletedAt: null, deletedBy: null, deletedReason: null, updatedAt: new Date() })
    .where(eq(leads.id, leadId));

  /*
    Bring the dedup identifiers back with it — but only the ones still
    free.

    While this lead was deleted its number was released, so somebody may
    have entered that person again and be working them now. Restoring the
    old identifier would collide with
    `lead_identifiers_kind_value_uq` and fail the whole restore with a
    constraint error nobody can read. Skipping the taken ones puts the
    lead back without the clash; the duplicate is then two leads sharing a
    number, which is an ordinary situation the merge flow exists for.
  */
  const restored = await db.execute(sql`
    update lead_identifiers i
       set deleted_at = null, updated_at = now()
     where i.lead_id = ${leadId}
       and i.deleted_at is not null
       and not exists (
         select 1 from lead_identifiers live
          where live.kind = i.kind
            and live.value_normalised = i.value_normalised
            and live.deleted_at is null
       )
    returning i.id
  `);

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.restore",
    after: { identifiersRestored: restored.length },
    entityType: "leads",
    entityId: leadId,
    before: { deletedAt: lead.deletedAt.toISOString(), deletedReason: lead.deletedReason },
  });

  revalidatePath("/leads");
  revalidatePath("/leads/deleted");
  revalidatePath(`/leads/${leadId}`);
  return { success: `${lead.studentName} is back in the pipeline.` };
}

/**
 * Sets a lead's temperature from the bar at the top of their page.
 *
 * Temperature is a column of its own, never derived from the stage
 * (CLAUDE.md non-negotiable #1), and this is the whole reason that
 * matters in practice: a counsellor who has just got off the phone knows
 * the lead is Hot while the stage is still Demo Scheduled. Before this
 * they had to open the edit form, change one dropdown among thirty and
 * press Save — so mostly they did not, and the temperature column slowly
 * stopped meaning anything.
 *
 * It stamps the same override window as the edit form does, through the
 * same helper: a judgement made here must survive the nightly recompute
 * exactly as one made there.
 */
export async function setLeadTemperature(
  leadId: string,
  temperature: string | null,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.update")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("leads")
    .select("temperature")
    .eq("id", leadId)
    .maybeSingle<{ temperature: string | null }>();
  if (!existing) return { error: "That lead no longer exists." };

  const next = temperature?.trim() || null;
  // Not an error, and not a write either: re-pressing the button you are
  // already on must not keep pushing the override window forward.
  if (next === existing.temperature) return {};

  const payload = {
    temperature: next,
    ...(next === null
      ? // Clearing it hands the lead back to the rules, which means
        // clearing the override too — otherwise "no temperature" would be
        // pinned for days as if somebody meant it.
        { temperature_override_until: null, temperature_set_by: null }
      : await temperatureOverrideFor(supabase, user.id)),
  };

  const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.update",
    entityType: "leads",
    entityId: leadId,
    before: { temperature: existing.temperature },
    after: payload,
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
  return { success: "Saved." };
}
