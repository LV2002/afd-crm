"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { batches, centers, enrolments, leads } from "@/lib/db/schema";
import { formatINR, parseRupeesToPaise } from "@/lib/format/currency";
import { dropAdmission, restoreAdmission } from "@/lib/enrolment/drop-admission";
import { recordPayment } from "@/lib/enrolment/record-payment";
import { reversePayment } from "@/lib/enrolment/reverse-payment";
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

  // Gate 2 fired, so academics has a new person to onboard. A separate
  // event from `payment.recorded` because it is a different fact told to
  // different people: the counsellor hears that the money arrived, and
  // academics hears that somebody has joined and is waiting on them.
  if (result.isFirstPayment) {
    const [centre] = enrolment.centerId
      ? await db.select({ name: centers.name }).from(centers).where(eq(centers.id, enrolment.centerId))
      : [];
    const [batch] = enrolment.batchId
      ? await db.select({ name: batches.name }).from(batches).where(eq(batches.id, enrolment.batchId))
      : [];

    await notify({
      eventKey: "student.created",
      context: {
        student_name: payingLead?.studentName ?? "Student",
        course: enrolment.course,
        batch_name: batch?.name ?? "no batch yet",
        center_name: centre?.name ?? "",
      },
      href: "/students/onboarding",
      entityType: "students",
      entityId: result.studentId ?? undefined,
      centerId: enrolment.centerId,
      actorId: user.id,
    });
  }

  revalidatePath(`/accounts/${enrolmentId}`);
  revalidatePath("/accounts");
  revalidatePath("/students", "layout");
  return {
    success: result.isFirstPayment
      ? `Payment recorded (receipt #${result.receiptNo}). ${payingLead?.studentName ?? "The student"} is now waiting to be onboarded by academics.`
      : `Payment recorded (receipt #${result.receiptNo}).`,
  };
}

/**
 * Undoes a payment: a reversal if it should never have been recorded, a
 * refund if the money is going back.
 *
 * Same enforcement shape as recordPaymentAction — `reversePayment()`
 * writes across `payments` and `finance_transactions` on the direct db
 * client, so this action is where the permission and the own/center/all
 * scope are actually checked.
 *
 * `payment.refund` rather than `payment.record`: taking money is not the
 * same authority as giving it back, and the seeded roles have always
 * drawn that line. What they did not have, until now, was anywhere to
 * exercise it.
 */
export async function reversePaymentAction(
  enrolmentId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payment.refund")) {
    return { error: "You don't have permission to reverse or refund a payment." };
  }
  const scope = scopeFor(user, "payment.refund");
  if (!scope) {
    return { error: "You don't have permission to do that." };
  }

  const paymentId = String(formData.get("paymentId") ?? "").trim();
  if (!paymentId) return { error: "Pick the payment to undo." };

  const kindRaw = String(formData.get("kind") ?? "").trim();
  if (kindRaw !== "reversal" && kindRaw !== "refund") {
    return { error: "Say whether this is a reversal or a refund." };
  }
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) {
    return { error: "Say why — it prints on the note and stays on the record." };
  }

  const methodRaw = formData.get("method");
  const method = isPaymentMethod(methodRaw) ? methodRaw : undefined;
  const accountId = String(formData.get("accountId") ?? "").trim() || null;

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
      reversePayment(tx, {
        paymentId,
        kind: kindRaw,
        reason,
        recordedBy: user.id,
        method,
        accountId,
      }),
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reverse that payment." };
  }

  // The payment has to belong to THIS enrolment. Checked after the fact
  // rather than before only because reversePayment() already loads it:
  // the scope check above was against the enrolment in the URL, so a
  // payment id from another admission would otherwise slip past it.
  if (result.enrolmentId !== enrolmentId) {
    throw new Error("reversePaymentAction: payment does not belong to this enrolment");
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "payment.reverse",
    entityType: "payments",
    entityId: result.reversalPaymentId,
    after: { enrolmentId, reverses: paymentId, kind: kindRaw, reason, amountPaise: result.amountPaise },
  });

  const [reversedLead] = await db.select().from(leads).where(eq(leads.id, enrolment.leadId));
  await notify({
    eventKey: "payment.reversed",
    context: {
      student_name: reversedLead?.studentName ?? "Student",
      amount: formatINR(result.amountPaise),
      kind: kindRaw === "refund" ? "refunded" : "reversed",
      reason,
      reversed_by: user.fullName,
    },
    href: `/accounts/${enrolmentId}`,
    entityType: "payments",
    entityId: result.reversalPaymentId,
    centerId: enrolment.centerId,
    ownerId: reversedLead?.assignedTo ?? null,
    actorId: user.id,
  });

  revalidatePath(`/accounts/${enrolmentId}`);
  revalidatePath("/accounts");
  revalidatePath("/finance", "layout");
  return {
    success:
      kindRaw === "refund"
        ? `Refund of ${formatINR(result.amountPaise)} recorded. Both rows stay in the ledger.`
        : `Payment of ${formatINR(result.amountPaise)} reversed. Both rows stay in the ledger.`,
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
