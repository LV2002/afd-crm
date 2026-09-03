"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { enrolmentInstalments, enrolments, leads } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

import {
  INSTALMENT_SLOTS,
  rupeesToPaise,
  validatePlan,
  type InstalmentInput,
} from "./instalment-plan";

export interface FeeFormState {
  error?: string;
  success?: string;
}

/**
 * Saves the fee and instalment plan a counsellor agreed with a student.
 *
 * Writes the commercial terms onto the lead's existing `enrolments` row
 * rather than inventing a parallel record — the enrolment IS the
 * commercial record (docs/01-DATA-MODEL.md), and duplicating fee figures
 * elsewhere would give the accounts team two numbers to reconcile.
 *
 * The instalment rows are replaced wholesale rather than diffed. A
 * renegotiated plan is a new plan, sequence numbers shift when a slot is
 * cleared, and matching old rows to new ones by position would silently
 * mis-assign due dates. Nothing in the append-only ledger is touched: this
 * is the intended schedule, not money received.
 */
export async function saveFeePlan(_prev: FeeFormState, formData: FormData): Promise<FeeFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "enrolment.update")) {
    return { error: "You don't have permission to set fees." };
  }

  const leadId = formData.get("leadId");
  if (typeof leadId !== "string") return { error: "Missing lead reference." };

  const [lead] = await db
    .select({ id: leads.id, centerId: leads.centerId, assignedTo: leads.assignedTo })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)));
  if (!lead) return { error: "Lead not found." };

  // The direct db client bypasses RLS, so the scope check RLS would have
  // made is re-implemented here — same pattern as confirmAdmissionAction.
  const scope = scopeFor(user, "enrolment.update");
  if (scope === "own" && lead.assignedTo !== user.id) {
    return { error: "That lead isn't assigned to you." };
  }
  if (scope === "center" && (!lead.centerId || !user.centerIds.includes(lead.centerId))) {
    return { error: "That lead isn't in your centre." };
  }

  const [enrolment] = await db
    .select({ id: enrolments.id })
    .from(enrolments)
    .where(and(eq(enrolments.leadId, leadId), isNull(enrolments.deletedAt)));
  if (!enrolment) {
    return { error: "Confirm the admission first — the fee plan hangs off the enrolment." };
  }

  const totalFeePaise = rupeesToPaise(String(formData.get("courseFee") ?? ""));
  if (totalFeePaise === null) return { error: "Enter the course fee as a number." };

  const discountRaw = String(formData.get("discount") ?? "").trim();
  const discountPaise = discountRaw === "" ? 0 : rupeesToPaise(discountRaw);
  if (discountPaise === null) return { error: "Enter the discount as a number, or leave it blank." };

  const discountName = String(formData.get("discountName") ?? "").trim() || null;

  const downRaw = String(formData.get("downPayment") ?? "").trim();
  const downPaymentPaise = downRaw === "" ? 0 : rupeesToPaise(downRaw);
  if (downPaymentPaise === null) {
    return { error: "Enter the down payment as a number, or leave it blank." };
  }
  const feeNotes = String(formData.get("feeNotes") ?? "").trim() || null;

  const instalments: InstalmentInput[] = [];
  for (const slot of INSTALMENT_SLOTS) {
    const amountRaw = String(formData.get(`instalment_${slot}_amount`) ?? "").trim();
    const dueDate = String(formData.get(`instalment_${slot}_due`) ?? "").trim();
    // A slot is either fully filled or ignored. Half a row — an amount with
    // no date — is a mistake worth reporting rather than silently dropping.
    if (amountRaw === "" && dueDate === "") continue;
    if (amountRaw === "" || dueDate === "") {
      return { error: `Instalment ${slot} needs both an amount and a due date.` };
    }
    const amountPaise = rupeesToPaise(amountRaw);
    if (amountPaise === null) return { error: `Instalment ${slot}'s amount isn't a number.` };
    instalments.push({ sequence: slot, dueDate, amountPaise });
  }

  const problems = validatePlan(totalFeePaise, discountPaise, instalments);
  if (problems.length > 0) return { error: problems[0] };

  await db.transaction(async (tx) => {
    await tx
      .update(enrolments)
      .set({
        totalFeePaise,
        discountPaise,
        discountName,
        downPaymentPaise,
        netFeePaise: totalFeePaise - discountPaise,
        feeNotes,
        updatedAt: new Date(),
      })
      .where(eq(enrolments.id, enrolment.id));

    await tx.delete(enrolmentInstalments).where(eq(enrolmentInstalments.enrolmentId, enrolment.id));
    if (instalments.length > 0) {
      await tx.insert(enrolmentInstalments).values(
        instalments.map((i) => ({
          enrolmentId: enrolment.id,
          sequence: i.sequence,
          dueDate: i.dueDate,
          amountPaise: i.amountPaise,
        })),
      );
    }
  });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "enrolment.fee_plan",
    entityType: "enrolments",
    entityId: enrolment.id,
    after: { totalFeePaise, discountPaise, discountName, downPaymentPaise, instalments, feeNotes },
  });

  revalidatePath(`/leads/${leadId}`);
  return { success: "Fee plan saved." };
}
