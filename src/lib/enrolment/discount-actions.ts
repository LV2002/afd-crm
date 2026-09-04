"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { enrolments, leads } from "@/lib/db/schema";
import { formatINR } from "@/lib/format/currency";
import { notify } from "@/lib/notifications/notify";
import { createClient } from "@/lib/supabase/server";

import { canApprove } from "./discount-authority";
import { getDiscountLimit } from "./get-discount-limit";

export interface DiscountDecisionState {
  error?: string;
  success?: string;
}

/**
 * Settle a discount request: grant it, or refuse it.
 *
 * Approving takes the permission AND enough authority of the approver's
 * own — otherwise a centre head could approve their own ₹50,000 discount
 * by routing it through a colleague on the same ceiling and the limit
 * would mean nothing. Rejecting needs only the permission: saying no to a
 * discount never gives anything away, so anyone who can weigh the request
 * can decline it.
 *
 * The write is a single UPDATE guarded on the pending figure still being
 * what the approver was shown. Two people opening the same request, or a
 * counsellor editing it while somebody looks at it, must not result in a
 * different amount being granted than the one that was read.
 */
export async function decideDiscount(
  _prev: DiscountDecisionState,
  formData: FormData,
): Promise<DiscountDecisionState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "discount.approve")) {
    return { error: "You don't have permission to approve discounts." };
  }

  const enrolmentId = formData.get("enrolmentId");
  const decision = formData.get("decision");
  if (typeof enrolmentId !== "string") return { error: "Missing enrolment reference." };
  if (decision !== "approve" && decision !== "reject") return { error: "Unknown decision." };

  const note = String(formData.get("note") ?? "").trim() || null;

  const [enrolment] = await db
    .select({
      id: enrolments.id,
      leadId: enrolments.leadId,
      centerId: enrolments.centerId,
      totalFeePaise: enrolments.totalFeePaise,
      discountPaise: enrolments.discountPaise,
      pendingDiscountPaise: enrolments.pendingDiscountPaise,
      pendingDiscountName: enrolments.pendingDiscountName,
    })
    .from(enrolments)
    .where(and(eq(enrolments.id, enrolmentId), isNull(enrolments.deletedAt)));

  if (!enrolment) return { error: "Enrolment not found." };
  if (enrolment.pendingDiscountPaise === null) {
    return { error: "There is nothing waiting for a decision on this enrolment." };
  }

  const pending = enrolment.pendingDiscountPaise;
  const now = new Date();

  if (decision === "approve") {
    const limit = await getDiscountLimit(user);
    if (!canApprove(limit, enrolment.totalFeePaise, pending)) {
      return {
        error:
          "That discount is larger than you can approve. Pass it to an admin — they can settle anything.",
      };
    }

    const updated = await db
      .update(enrolments)
      .set({
        discountPaise: pending,
        netFeePaise: enrolment.totalFeePaise - pending,
        discountName: enrolment.pendingDiscountName,
        pendingDiscountPaise: null,
        pendingDiscountName: null,
        pendingDiscountBy: null,
        pendingDiscountAt: null,
        discountDecidedBy: user.id,
        discountDecidedAt: now,
        discountDecisionNote: note,
        updatedAt: now,
      })
      // Guarded on the figure still being the one that was read, so a
      // concurrent edit cannot turn an approval of ₹5,000 into ₹25,000.
      .where(and(eq(enrolments.id, enrolmentId), eq(enrolments.pendingDiscountPaise, pending)))
      .returning({ id: enrolments.id });

    if (updated.length === 0) {
      return { error: "That request changed while you were looking at it. Reload and check again." };
    }
  } else {
    const updated = await db
      .update(enrolments)
      .set({
        // The applied discount is left exactly as it was: rejecting a
        // request for MORE must not take away what was already granted.
        pendingDiscountPaise: null,
        pendingDiscountName: null,
        pendingDiscountBy: null,
        pendingDiscountAt: null,
        discountDecidedBy: user.id,
        discountDecidedAt: now,
        discountDecisionNote: note,
        updatedAt: now,
      })
      .where(and(eq(enrolments.id, enrolmentId), eq(enrolments.pendingDiscountPaise, pending)))
      .returning({ id: enrolments.id });

    if (updated.length === 0) {
      return { error: "That request changed while you were looking at it. Reload and check again." };
    }
  }

  const [lead] = await db
    .select({ studentName: leads.studentName, assignedTo: leads.assignedTo })
    .from(leads)
    .where(eq(leads.id, enrolment.leadId));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: decision === "approve" ? "discount.approved" : "discount.rejected",
    entityType: "enrolments",
    entityId: enrolmentId,
    before: { discountPaise: enrolment.discountPaise, pendingDiscountPaise: pending },
    after: {
      discountPaise: decision === "approve" ? pending : enrolment.discountPaise,
      note,
    },
  });

  // The counsellor agreed this figure with a student and has to go back to
  // them either way, so they hear about a rejection as well as a grant.
  await notify({
    eventKey: "discount.decided",
    context: {
      lead_name: lead?.studentName ?? "a student",
      amount: formatINR(pending),
      decision: decision === "approve" ? "approved" : "rejected",
      decided_by: user.fullName,
      note: note ?? "",
    },
    href: `/leads/${enrolment.leadId}`,
    entityType: "enrolments",
    entityId: enrolmentId,
    centerId: enrolment.centerId,
    ownerId: lead?.assignedTo ?? null,
    actorId: user.id,
  });

  revalidatePath(`/leads/${enrolment.leadId}`);
  revalidatePath(`/accounts/${enrolmentId}`);

  return {
    success:
      decision === "approve"
        ? `Approved. ${formatINR(pending)} is now off the fee.`
        : "Rejected. The fee is unchanged and the counsellor has been told.",
  };
}
