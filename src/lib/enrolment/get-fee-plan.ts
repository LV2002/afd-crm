import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { enrolmentInstalments, enrolments, profiles } from "@/lib/db/schema";

import type { FeePlanValues } from "@/components/enrolment/fee-plan-panel";

/** Paise back to the plain rupee string a counsellor typed. */
function paiseToInput(paise: number | null): string {
  if (paise === null || paise === 0) return "";
  return (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);
}

/** A discount asked for and not yet settled. Null when there is nothing outstanding. */
export interface PendingDiscountInfo {
  paise: number;
  requestedBy: string | null;
  requestedAt: string | null;
}

export interface LeadFeePlan {
  hasEnrolment: boolean;
  enrolmentId: string | null;
  values: FeePlanValues;
  totalFeePaise: number;
  pendingDiscount: PendingDiscountInfo | null;
}

const EMPTY: FeePlanValues = {
  courseFee: "",
  discount: "",
  discountName: "",
  downPayment: "",
  feeNotes: "",
  instalments: [],
};

export async function getLeadFeePlan(leadId: string): Promise<LeadFeePlan> {
  const [enrolment] = await db
    .select({
      id: enrolments.id,
      totalFeePaise: enrolments.totalFeePaise,
      discountPaise: enrolments.discountPaise,
      discountName: enrolments.discountName,
      downPaymentPaise: enrolments.downPaymentPaise,
      feeNotes: enrolments.feeNotes,
      pendingDiscountPaise: enrolments.pendingDiscountPaise,
      pendingDiscountBy: enrolments.pendingDiscountBy,
      pendingDiscountAt: enrolments.pendingDiscountAt,
    })
    .from(enrolments)
    .where(and(eq(enrolments.leadId, leadId), isNull(enrolments.deletedAt)));

  if (!enrolment) {
    return {
      hasEnrolment: false,
      enrolmentId: null,
      values: EMPTY,
      totalFeePaise: 0,
      pendingDiscount: null,
    };
  }

  // The requester's name, so the banner says who agreed the figure with
  // the student rather than leaving an approver to go and find out.
  const requester = enrolment.pendingDiscountBy
    ? (
        await db
          .select({ fullName: profiles.fullName })
          .from(profiles)
          .where(eq(profiles.id, enrolment.pendingDiscountBy))
      )[0]
    : undefined;

  const instalments = await db
    .select({
      sequence: enrolmentInstalments.sequence,
      dueDate: enrolmentInstalments.dueDate,
      amountPaise: enrolmentInstalments.amountPaise,
    })
    .from(enrolmentInstalments)
    .where(eq(enrolmentInstalments.enrolmentId, enrolment.id))
    .orderBy(asc(enrolmentInstalments.sequence));

  return {
    hasEnrolment: true,
    enrolmentId: enrolment.id,
    totalFeePaise: enrolment.totalFeePaise,
    pendingDiscount:
      enrolment.pendingDiscountPaise === null
        ? null
        : {
            paise: enrolment.pendingDiscountPaise,
            requestedBy: requester?.fullName ?? null,
            requestedAt: enrolment.pendingDiscountAt?.toISOString() ?? null,
          },
    values: {
      courseFee: paiseToInput(enrolment.totalFeePaise),
      discount: paiseToInput(enrolment.discountPaise),
      discountName: enrolment.discountName ?? "",
      downPayment: paiseToInput(enrolment.downPaymentPaise),
      feeNotes: enrolment.feeNotes ?? "",
      instalments: instalments.map((i) => ({
        sequence: i.sequence,
        dueDate: i.dueDate,
        amount: paiseToInput(i.amountPaise),
      })),
    },
  };
}
