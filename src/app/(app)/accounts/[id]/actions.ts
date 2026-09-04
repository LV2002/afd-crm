"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { enrolments, leads } from "@/lib/db/schema";
import { formatINR, parseRupeesToPaise } from "@/lib/format/currency";
import { dropAdmission, restoreAdmission } from "@/lib/enrolment/drop-admission";
import { recordPayment } from "@/lib/enrolment/record-payment";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  success?: string;
}

const PAYMENT_METHODS = ["cash", "upi", "card", "neft", "cheque", "other"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/**
 * Gate 2 (accounts -> academics) on its first call for an enrolment.
 * recordPayment() runs on the direct db client (see its own doc comment),
 * so — same pattern as confirmAdmissionAction()/confirmMerge() — this
 * action is the enforcement point: re-implements the own/center/all scope
 * check `can_access_center()` would apply, checked against the enrolment's
 * centre (or, for 'own' scope, the underlying lead's owner) before ever
 * touching the database.
 */
export async function recordPaymentAction(
  enrolmentId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payment.record")) {
    return { error: "You don't have permission to do that." };
  }
  const scope = scopeFor(user, "payment.record");
  if (!scope) {
    return { error: "You don't have permission to do that." };
  }

  const amountPaise = parseRupeesToPaise(formData.get("amount"));
  if (!amountPaise || amountPaise <= 0) {
    return { error: "Enter a valid amount." };
  }
  const method = formData.get("method");
  if (!isPaymentMethod(method)) {
    return { error: "Select a payment method." };
  }
  const referenceRaw = formData.get("reference");
  const reference = typeof referenceRaw === "string" && referenceRaw.trim() ? referenceRaw.trim() : null;

  const accountId = String(formData.get("accountId") ?? "").trim();

  const [enrolment] = await db.select().from(enrolments).where(eq(enrolments.id, enrolmentId));
  if (!enrolment || enrolment.deletedAt) {
    return { error: "This enrolment no longer exists." };
  }

  if (scope === "center" && !user.centerIds.includes(enrolment.centerId)) {
    return { error: "This enrolment is outside your access." };
  }
  if (scope === "own") {
    const [lead] = await db.select().from(leads).where(eq(leads.id, enrolment.leadId));
    if (!lead || lead.assignedTo !== user.id) {
      return { error: "This enrolment is outside your access." };
    }
  }

  let result;
  try {
    result = await db.transaction((tx) =>
      recordPayment(tx, {
        enrolmentId,
        amountPaise,
        method,
        reference,
        recordedBy: user.id,
        // Empty when the institute has no finance accounts set up yet.
        // The payment is still recorded; the finance reports show it under
        // "not attributed to an account" rather than pretending otherwise.
        accountId: accountId || null,
      }),
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record payment." };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "payment.record",
    entityType: "payments",
    entityId: result.paymentId,
    after: { enrolmentId, amountPaise, method, reference, isFirstPayment: result.isFirstPayment },
  });

  // The counsellor who sold it wants to know the money arrived; accounts
  // wants a record of the receipt. Both come off one configurable event.
  const [payingLead] = await db.select().from(leads).where(eq(leads.id, enrolment.leadId));
  await notify({
    eventKey: "payment.recorded",
    context: {
      student_name: payingLead?.studentName ?? "Student",
      amount: formatINR(amountPaise),
      method,
      receipt_number: result.receiptNo,
    },
    href: `/accounts/${enrolmentId}`,
    entityType: "payments",
    entityId: result.paymentId,
    centerId: enrolment.centerId,
    ownerId: payingLead?.assignedTo ?? null,
    actorId: user.id,
  });

  revalidatePath(`/accounts/${enrolmentId}`);
  revalidatePath("/accounts");
  return {
    success: result.isFirstPayment
      ? `Payment recorded (receipt #${result.receiptNo}). Student record created.`
      : `Payment recorded (receipt #${result.receiptNo}).`,
  };
}

/**
 * Marks an admission dropped, or restores one marked by mistake.
 *
 * Same enforcement shape as recordPaymentAction above, for the same
 * reason: dropAdmission() writes across `enrolments` and `students` on the
 * direct db client (see its own doc comment), so this action is where the
 * permission and the own/center/all scope are actually checked — against
 * the enrolment's centre, or the underlying lead's owner at 'own' scope.
 *
 * `enrolment.drop` rather than `enrolment.update`: retiring a conversion
 * and calling off a fee chase is not the same authority as correcting a
 * fee, and the seeded counsellor role deliberately doesn't hold it.
 */
export async function dropAdmissionAction(
  enrolmentId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "enrolment.drop")) {
    return { error: "You don't have permission to mark an admission dropped." };
  }
  const scope = scopeFor(user, "enrolment.drop");
  if (!scope) {
    return { error: "You don't have permission to mark an admission dropped." };
  }

  const restore = formData.get("intent") === "restore";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!restore && !reason) {
    return { error: "Say why they left — three departments read this." };
  }

  const [enrolment] = await db.select().from(enrolments).where(eq(enrolments.id, enrolmentId));
  if (!enrolment || enrolment.deletedAt) {
    return { error: "This enrolment no longer exists." };
  }
  if (scope === "center" && !user.centerIds.includes(enrolment.centerId)) {
    return { error: "This enrolment is outside your access." };
  }
  if (scope === "own") {
    const [lead] = await db.select().from(leads).where(eq(leads.id, enrolment.leadId));
    if (!lead || lead.assignedTo !== user.id) {
      return { error: "This enrolment is outside your access." };
    }
  }

  let result;
  try {
    result = await db.transaction((tx) =>
      restore
        ? restoreAdmission(tx, { enrolmentId })
        : dropAdmission(tx, { enrolmentId, reason, droppedBy: user.id }),
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update this admission." };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: restore ? "enrolment.restore" : "enrolment.drop",
    entityType: "enrolments",
    entityId: enrolmentId,
    before: { droppedAt: enrolment.droppedAt, dropReason: enrolment.dropReason },
    after: restore ? { droppedAt: null } : { droppedAt: new Date().toISOString(), reason },
  });

  const [droppedLead] = await db.select().from(leads).where(eq(leads.id, enrolment.leadId));

  // Only the drop notifies. A restore is a correction — the people who
  // were told already know, and a second message saying "actually, no"
  // reads as noise rather than news.
  if (!restore) {
    await notify({
      eventKey: "admission.dropped",
      context: {
        student_name: droppedLead?.studentName ?? "Student",
        course: result.course,
        reason,
        recorded_by: user.fullName,
      },
      href: `/accounts/${enrolmentId}`,
      entityType: "enrolments",
      entityId: enrolmentId,
      centerId: enrolment.centerId,
      ownerId: droppedLead?.assignedTo ?? null,
      actorId: user.id,
    });
  }

  revalidatePath(`/accounts/${enrolmentId}`);
  revalidatePath("/accounts");
  revalidatePath(`/leads/${enrolment.leadId}`);
  revalidatePath("/students");
  return {
    success: restore
      ? "Restored. This admission counts again, and the fee is back on the collections list."
      : "Marked as dropped. Sales, accounts and academics will all see it.",
  };
}
