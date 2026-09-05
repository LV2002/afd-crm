"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { enrolmentPromos, enrolmentInstalments, enrolments, leads, promos } from "@/lib/db/schema";
import { formatINR } from "@/lib/format/currency";
import { notify } from "@/lib/notifications/notify";
import { createClient } from "@/lib/supabase/server";

import { discountPercent, resolveDiscount } from "./discount-authority";
import { getDiscountLimit } from "./get-discount-limit";
import { promoDiscountPaise, promoUsable, type Promo } from "./promos";
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
    .select({
      id: leads.id,
      studentName: leads.studentName,
      centerId: leads.centerId,
      assignedTo: leads.assignedTo,
    })
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
    .select({
      id: enrolments.id,
      discountPaise: enrolments.discountPaise,
      course: enrolments.course,
      centerId: enrolments.centerId,
    })
    .from(enrolments)
    .where(and(eq(enrolments.leadId, leadId), isNull(enrolments.deletedAt)));
  if (!enrolment) {
    return { error: "Confirm the admission first — the fee plan hangs off the enrolment." };
  }

  const totalFeePaise = rupeesToPaise(String(formData.get("courseFee") ?? ""));
  if (totalFeePaise === null) return { error: "Enter the course fee as a number." };

  const discountRaw = String(formData.get("discount") ?? "").trim();
  const discountPaise = discountRaw === "" ? 0 : rupeesToPaise(discountRaw);
  if (discountPaise === null)
    return { error: "Enter the discount as a number, or leave it blank." };

  const discountName = String(formData.get("discountName") ?? "").trim() || null;
  const promoId = String(formData.get("promoId") ?? "").trim() || null;

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

  // What this person may actually give. A discount above their ceiling is
  // recorded as a request and NOT applied — see discount-authority.ts for
  // why an unapproved discount must not already be reducing the bill.
  // `enrolment.discountPaise` is what was previously granted, which is
  // what stops the obvious way round: approve ₹5,000, then edit it to
  // ₹25,000.
  // An offer the institute is running, if one was picked.
  //
  // A promo is PRE-APPROVED by definition: the institute decided on it in
  // advance and wrote down its cap and its expiry, so applying one is not
  // the counsellor exercising personal authority. That is expressed by
  // treating the promo's amount as already-approved below rather than by
  // a second code path — which means everything else about the authority
  // machinery still applies, including the fact that asking for MORE than
  // the offer still queues for approval.
  let promo: Promo | null = null;
  let promoDiscount = 0;
  let alreadyOnThisPromo = false;
  if (promoId) {
    const [row] = await db
      .select()
      .from(promos)
      .where(and(eq(promos.id, promoId), isNull(promos.deletedAt)));
    if (!row) return { error: "That offer no longer exists." };

    promo = {
      id: row.id,
      name: row.name,
      code: row.code,
      discountType: row.discountType === "fixed" ? "fixed" : "percentage",
      percentValue: row.percentValue === null ? null : Number(row.percentValue),
      fixedPaise: row.fixedPaise,
      maxDiscountPaise: row.maxDiscountPaise,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      courses: row.courses ?? [],
      centerIds: row.centerIds ?? [],
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      isActive: row.isActive,
    };

    const check = promoUsable(promo, {
      // The institute's today, in Kochi and Kannur, not the server's.
      asOf: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
      course: enrolment.course,
      centerId: enrolment.centerId,
    });
    if (!check.ok) return { error: check.reason };

    promoDiscount = promoDiscountPaise(promo, totalFeePaise);

    const [existing] = await db
      .select({ promoId: enrolmentPromos.promoId })
      .from(enrolmentPromos)
      .where(eq(enrolmentPromos.enrolmentId, enrolment.id));
    alreadyOnThisPromo = existing?.promoId === promo.id;
  }

  // What this person may actually give. A discount above their ceiling is
  // recorded as a request and NOT applied — see discount-authority.ts for
  // why an unapproved discount must not already be reducing the bill.
  //
  // The floor is the larger of what was previously granted and what the
  // chosen offer is worth: a granted discount is never taken away, and an
  // offer the institute is running needs nobody's permission.
  const outcome = resolveDiscount({
    limit: await getDiscountLimit(user),
    totalFeePaise,
    requestedPaise: discountPaise,
    alreadyApprovedPaise: Math.max(enrolment.discountPaise, promoDiscount),
  });

  // The instalments were validated against the figure the counsellor
  // typed. If it is not being applied, they add up to less than the
  // student now owes, so say so rather than writing a schedule that is
  // quietly short.
  if (outcome.needsApproval && instalments.length > 0) {
    const scheduled = instalments.reduce((sum, i) => sum + i.amountPaise, 0);
    if (scheduled < totalFeePaise - outcome.appliedDiscountPaise) {
      return {
        error: `${outcome.reason} Save the plan without the discount for now, or with instalments totalling the full fee — the discount can be applied once it is approved.`,
      };
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(enrolments)
      .set({
        totalFeePaise,
        discountPaise: outcome.appliedDiscountPaise,
        discountName,
        downPaymentPaise,
        netFeePaise: totalFeePaise - outcome.appliedDiscountPaise,
        pendingDiscountPaise: outcome.pendingDiscountPaise,
        pendingDiscountName: outcome.pendingDiscountPaise === null ? null : discountName,
        pendingDiscountBy: outcome.pendingDiscountPaise === null ? null : user.id,
        pendingDiscountAt: outcome.pendingDiscountPaise === null ? null : new Date(),
        feeNotes,
        updatedAt: new Date(),
      })
      .where(eq(enrolments.id, enrolment.id));

    // Which offer this admission took, and what it was worth AT THE TIME.
    // The amount is kept rather than recomputed, because "what did Early
    // Bird actually cost us?" has to stay answerable after somebody edits
    // the offer or lets it expire.
    if (promo) {
      await tx
        .insert(enrolmentPromos)
        .values({
          enrolmentId: enrolment.id,
          promoId: promo.id,
          discountPaise: promoDiscount,
          appliedBy: user.id,
        })
        .onConflictDoUpdate({
          target: enrolmentPromos.enrolmentId,
          set: {
            promoId: promo.id,
            discountPaise: promoDiscount,
            appliedBy: user.id,
            updatedAt: new Date(),
          },
        });

      // The counter moves only the FIRST time this admission takes this
      // offer. `alreadyOnThisPromo` was read before the transaction, so
      // re-saving the fee panel four times cannot use up four seats of a
      // twenty-seat promotion.
      if (!alreadyOnThisPromo) {
        await tx
          .update(promos)
          .set({ usedCount: sql`${promos.usedCount} + 1` })
          .where(eq(promos.id, promo.id));
      }
    }

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
    after: {
      totalFeePaise,
      discountRequestedPaise: discountPaise,
      discountAppliedPaise: outcome.appliedDiscountPaise,
      discountPendingPaise: outcome.pendingDiscountPaise,
      discountName,
      downPaymentPaise,
      instalments,
      feeNotes,
    },
  });

  if (outcome.needsApproval) {
    // Somebody has to answer this, and nobody would find it otherwise —
    // an unapproved discount is invisible unless you open the lead.
    await notify({
      eventKey: "discount.approval_requested",
      context: {
        lead_name: lead.studentName,
        amount: formatINR(outcome.pendingDiscountPaise ?? 0),
        percent: String(discountPercent(totalFeePaise, outcome.pendingDiscountPaise ?? 0)),
        requested_by: user.fullName,
      },
      href: `/leads/${leadId}`,
      entityType: "enrolments",
      entityId: enrolment.id,
      centerId: lead.centerId,
      ownerId: lead.assignedTo,
      actorId: user.id,
    });
  }

  revalidatePath(`/leads/${leadId}`);
  return outcome.needsApproval
    ? {
        success: `Fee plan saved. ${outcome.reason} The student owes the full fee until it is approved.`,
      }
    : { success: "Fee plan saved." };
}
