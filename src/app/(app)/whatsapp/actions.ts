"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { reportActionFailure } from "@/lib/errors/action-failure";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";
import { createClient } from "@/lib/supabase/server";

/**
 * Turning a WhatsApp conversation into an enquiry.
 *
 * The API number is a broadcasting channel, so an inbound message is
 * matched to a lead and never creates one (migration 0042, and the
 * `whatsapp_messages.lead_id` comment). That rule is right and stays:
 * most replies are somebody who pressed a button on a campaign, and
 * manufacturing a lead from each would fill the pipeline with people who
 * are not enrolling.
 *
 * What was missing is the other half. A reply that *is* an enquiry had
 * nowhere to go but a counsellor retyping the number into Leads → New,
 * and the conversation stayed orphaned afterwards. This is the Instagram
 * model (`instagram/actions.ts`, DECISIONS 2026-10-04) applied to
 * WhatsApp: the conversation is the object, and somebody decides later
 * whether it is a lead.
 *
 * Two things it does that the Instagram version does not:
 *
 * **The phone is already known**, so it is not asked for. Instagram gives
 * an account id and sometimes a handle, never a number; WhatsApp gives
 * nothing but the number.
 *
 * **The history is carried over.** Instagram links the conversation row
 * and the messages hang off it, but a WhatsApp thread is assembled from
 * the message rows themselves, so a conversion that only created a lead
 * would leave every message already in the thread stranded under "Not in
 * the CRM" for good. They are moved onto the lead in the same breath.
 */

export interface WhatsAppConvertState {
  error?: string;
  success?: string;
}

const convertSchema = z.object({
  phone: z.string().min(1, "No number on that conversation."),
  studentName: z.string().trim().min(1, "A name is required.").max(200),
});

export async function convertWhatsAppThreadToLead(
  _prevState: WhatsAppConvertState,
  formData: FormData,
): Promise<WhatsAppConvertState> {
  try {
    return await runConvert(formData);
  } catch (error) {
    return {
      error: await reportActionFailure("action:convertWhatsAppThreadToLead", error, {
        fallback: "Could not create the lead. The problem has been reported.",
      }),
    };
  }
}

async function runConvert(formData: FormData): Promise<WhatsAppConvertState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.create")) {
    return { error: "You don't have permission to create a lead." };
  }

  const parsed = convertSchema.safeParse({
    phone: formData.get("phone"),
    studentName: formData.get("studentName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Normalised again rather than trusted: the value came from a hidden
  // field, and E.164 on write is the rule everywhere (CLAUDE.md).
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: "That conversation's number isn't one we can dial." };

  const supabase = await createClient();

  /*
    Read the thread through RLS before writing anything. This is the
    authorisation check: migration 0090 only shows an unmatched row to
    somebody who runs campaigns or owns the number it arrived on, so a
    row coming back here means this user is allowed to act on it. Without
    it, anybody holding `lead.create` could convert a conversation they
    cannot see by posting a phone number.
  */
  const { data: visible } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .is("lead_id", null)
    .eq("from_phone", phone)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!visible) {
    return { error: "That conversation is not available to you." };
  }

  // Non-negotiable #8: one ingestion path. resolveOrCreateLead() links an
  // existing person rather than duplicating them — somebody who enquired
  // from Meta in March and messages on WhatsApp in October is one lead —
  // and runs applyAssignment() itself, so the rules decide the counsellor.
  const result = await resolveOrCreateLead({
    studentName: parsed.data.studentName,
    primaryPhone: phone,
    source: "whatsapp",
    raw: { convertedFromThread: phone },
    dedupeKey: `whatsapp:${phone}`,
    actorId: user.id,
  });

  /*
    Move the conversation onto the lead.

    Scoped to `lead_id is null` so this can never reassign a message that
    already belongs to somebody — two leads sharing a number is a real
    situation (it is why the merge flow exists), and a conversion must not
    quietly pull another lead's history across.
  */
  const { error: linkError, count } = await supabase
    .from("whatsapp_messages")
    .update({ lead_id: result.leadId }, { count: "exact" })
    .is("lead_id", null)
    .eq("from_phone", phone);

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.thread_converted",
    entityType: "leads",
    entityId: result.leadId,
    after: { phone, isNewLead: result.isNewLead, messagesMoved: count ?? 0 },
  });

  revalidatePath("/whatsapp");
  revalidatePath(`/leads/${result.leadId}`);

  /*
    `count === 0` is not a no-op, it is a refusal.

    We confirmed a visible unmatched row for this number a moment ago, so
    nothing should match zero. What gets here is RLS: the UPDATE's
    `with check` re-tests the row in its NEW shape, and the new shape has
    a lead — one the assignment rules may have put in a centre this user
    cannot send on. The lead is real and the conversion half-happened, so
    the only wrong answer is a success message.
  */
  if (linkError || count === 0) {
    return {
      error: `${parsed.data.studentName} was created, but the earlier messages could not be moved onto them — they are still under "Not in the CRM". That usually means the lead was assigned to a centre you cannot send on.`,
    };
  }

  return {
    success: result.isNewLead
      ? `${parsed.data.studentName} is now a lead, with this conversation attached.`
      : `This conversation is now attached to ${parsed.data.studentName}, who was already in the CRM.`,
  };
}
