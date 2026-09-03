"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { enrolments, leads } from "@/lib/db/schema";
import { formatINR, parseRupeesToPaise } from "@/lib/format/currency";
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
      recordPayment(tx, { enrolmentId, amountPaise, method, reference, recordedBy: user.id }),
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
