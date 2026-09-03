import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { enrolmentInstalments, enrolments } from "@/lib/db/schema";

import type { FeePlanValues } from "@/components/enrolment/fee-plan-panel";

/** Paise back to the plain rupee string a counsellor typed. */
function paiseToInput(paise: number | null): string {
  if (paise === null || paise === 0) return "";
  return (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);
}

export interface LeadFeePlan {
  hasEnrolment: boolean;
  enrolmentId: string | null;
  values: FeePlanValues;
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
    })
    .from(enrolments)
    .where(and(eq(enrolments.leadId, leadId), isNull(enrolments.deletedAt)));

  if (!enrolment) return { hasEnrolment: false, enrolmentId: null, values: EMPTY };

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
