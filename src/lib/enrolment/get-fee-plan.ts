import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  enrolmentPromos,
  enrolmentInstalments,
  enrolments,
  profiles,
  promos,
} from "@/lib/db/schema";

import type { FeePlanValues } from "@/components/enrolment/fee-plan-panel";
import { usablePromos, type Promo } from "./promos";

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
  /** The offers running for this admission's course and centre, ready for the picker. */
  promos: Promo[];
}

const EMPTY: FeePlanValues = {
  courseFee: "",
  discount: "",
  discountName: "",
  promoId: "",
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
      course: enrolments.course,
      centerId: enrolments.centerId,
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
      // No admission yet, so no course or centre to match an offer
      // against. Offering one here would mean offering all of them.
      promos: [],
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

  // The offers running for THIS admission — filtered here rather than in
  // the browser so a Kannur-only offer is never even sent to a Kochi
  // counsellor's screen for them to wonder about.
  const [promoRows, applied] = await Promise.all([
    db
      .select()
      .from(promos)
      .where(and(eq(promos.isActive, true), isNull(promos.deletedAt))),
    db
      .select({ promoId: enrolmentPromos.promoId })
      .from(enrolmentPromos)
      .where(eq(enrolmentPromos.enrolmentId, enrolment.id)),
  ]);
  const appliedPromoId = applied[0]?.promoId ?? null;

  const availablePromos = usablePromos(
    promoRows.map(
      (row): Promo => ({
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
      }),
    ),
    {
      asOf: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
      course: enrolment.course,
      centerId: enrolment.centerId,
    },
  );

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
    promos: availablePromos,
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
      promoId: appliedPromoId ?? "",
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
