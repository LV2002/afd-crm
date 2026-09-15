"use server";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { NOT_PROVIDED, parseFieldValue } from "@/lib/fields/parse-field-value";
import { notify } from "@/lib/notifications/notify";

import { getProfileFormByToken } from "./get-form";

export interface ProfileSubmitState {
  error?: string;
  success?: string;
}

/**
 * A student submitting their own profile form.
 *
 * The answers go into `leads.profile_form_data` as a jsonb blob keyed by
 * the student field definitions' keys — NOT onto the lead's own columns.
 * That separation is the point: this is what the student said about
 * themselves, kept distinct from what the counsellor recorded, so neither
 * silently overwrites the other and the counsellor can see both when they
 * differ. The blob becomes the student record's starting point at the
 * accounts→academics gate.
 *
 * Anonymous by definition, so it runs on the direct db connection — the
 * same trust boundary as the webhooks, for the same reason.
 */
export async function submitProfileForm(
  _prev: ProfileSubmitState,
  formData: FormData,
): Promise<ProfileSubmitState> {
  const token = formData.get("token");
  if (typeof token !== "string") return { error: "This form link is not valid." };

  // Hidden field a person never sees. Cheap, and it stops naive bots.
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    return { success: "Thank you — your details have been received." };
  }

  const lookup = await getProfileFormByToken(token);
  if (lookup.status !== "ok") return { error: "This form link is not valid." };
  const form = lookup.form;

  if (form.alreadySubmitted) {
    // Refusing a resubmission rather than overwriting: once a counsellor
    // has worked from these answers, a second silent submission from a
    // forwarded link would change the record under them. A genuine
    // correction goes through the counsellor, who can see both versions.
    return { error: "This form has already been submitted. Please contact the centre to make changes." };
  }

  const answers: Record<string, unknown> = {};
  for (const field of form.fields) {
    // Typed, and it says so when an answer is wrong instead of dropping
    // it to null behind a thank-you (security audit 2026-09-15, finding
    // #10). Same parser the counsellor's own edit form uses, so a student
    // and a counsellor cannot disagree about what a valid answer is.
    const raw =
      field.type === "multiselect"
        ? formData.getAll(field.key).map(String)
        : (formData.get(field.key) as string | null);

    const parsed = parseFieldValue(field, raw, field.options);
    if (!parsed.ok) return { error: parsed.message };

    const value = parsed.value;
    if (value === NOT_PROVIDED || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    answers[field.key] = value;
  }

  if (Object.keys(answers).length === 0) {
    return { error: "Please fill in the form before submitting." };
  }

  await db
    .update(leads)
    .set({
      profileFormData: answers,
      profileFormSubmittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, form.leadId));

  // The counsellor who sent the link is waiting on this. Notified after
  // the write, and never allowed to fail the submission: a student who
  // filled the form in must always get their thank-you.
  const [lead] = await db
    .select({
      studentName: leads.studentName,
      leadNumber: leads.leadNumber,
      centerId: leads.centerId,
      assignedTo: leads.assignedTo,
    })
    .from(leads)
    .where(eq(leads.id, form.leadId));

  if (lead) {
    await notify({
      eventKey: "profile_form.submitted",
      context: {
        lead_name: lead.studentName,
        lead_number: lead.leadNumber,
        },
      href: `/leads/${form.leadId}`,
      entityType: "leads",
      entityId: form.leadId,
      centerId: lead.centerId,
      ownerId: lead.assignedTo,
    });
  }

  return { success: "Thank you — your details have been received." };
}
