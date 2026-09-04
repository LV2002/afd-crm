import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  batches,
  centers,
  enquiries,
  enrolmentInstalments,
  enrolments,
  leadTags,
  leads,
  payments,
  pipelineStages,
  profiles,
  receipts,
  students,
  tags,
} from "@/lib/db/schema";
import { formatINR } from "@/lib/format/currency";
import { maskPhone } from "@/lib/leads/mask-phone";
import { normalizePhone } from "@/lib/identity/normalize-phone";

import { analystScope } from "./scope";
import type { AnalystContext } from "./index";

/**
 * One person's whole story, for the analyst.
 *
 * Every other tool returns aggregates and nothing else — no name, no
 * phone, no individual row — because they are usable by anyone holding
 * `ai.query`, and a tool that returns people is a tool that can be turned
 * into a contact export (CLAUDE.md § Non-negotiables 6).
 *
 * These two are the deliberate exception, and Leon's explicit ask: "if I
 * ask for a full history on a student it should be able to give me their
 * profile, their enquiry date, how long they took to join, what their fee
 * plan is, how much they paid, are they currently studying with us."
 *
 * They are safe because of who can reach them, not because of what they
 * withhold. Both refuse anybody without org-wide report access — the same
 * people who can already open any lead, any enrolment and any student
 * record by clicking on it. The analyst is not a way around a permission;
 * it is a faster way to use one somebody already has. That check is in the
 * code rather than assumed from the seeded roles, because roles are
 * editable rows and somebody may grant `ai.query` more widely tomorrow.
 *
 * Every lookup writes an audit row against the lead — see the
 * `ai.person_history` write in app/api/ai/query/route.ts, which is where
 * the request has a Supabase client. Same reason an export is audited:
 * reading one person's file is a thing worth accounting for afterwards.
 */

const SCOPE_REFUSAL = {
  error:
    "Looking up an individual needs organisation-wide report access. Ask an admin, or ask a question about totals instead.",
} as const;

export interface PersonMatch {
  leadId: string;
  leadNumber: number;
  name: string;
  centre: string | null;
  stage: string | null;
  firstEnquiry: string | null;
}

/** Resolves a name, phone or lead number to candidates the model can choose between. */
export async function findPeople(query: string): Promise<PersonMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const asNumber = Number(trimmed.replace(/\D/g, ""));
  const phone = normalizePhone(trimmed);

  const rows = await db
    .select({
      leadId: leads.id,
      leadNumber: leads.leadNumber,
      name: leads.studentName,
      centre: centers.name,
      stage: pipelineStages.name,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(centers, eq(centers.id, leads.centerId))
    .leftJoin(pipelineStages, eq(pipelineStages.id, leads.stageId))
    .where(
      and(
        isNull(leads.deletedAt),
        or(
          ilike(leads.studentName, `%${trimmed}%`),
          phone ? eq(leads.primaryPhone, phone) : undefined,
          // A bare number is far more likely to be the lead number people
          // read off the screen than a coincidence in a name.
          Number.isFinite(asNumber) && asNumber > 0 && /^\d+$/.test(trimmed)
            ? eq(leads.leadNumber, asNumber)
            : undefined,
        ),
      ),
    )
    .orderBy(desc(leads.createdAt))
    .limit(8);

  return rows.map((row) => ({
    leadId: row.leadId,
    leadNumber: row.leadNumber,
    name: row.name,
    centre: row.centre,
    stage: row.stage,
    firstEnquiry: row.createdAt?.toISOString() ?? null,
  }));
}

function daysBetween(from: Date | null | undefined, to: Date | null | undefined): number | null {
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Everything the CRM knows about one person, assembled from the six tables that hold it. */
export async function personHistory(leadId: string, canRevealPhone: boolean) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)));
  if (!lead) return { error: "No lead with that id." };

  const [
    centreRow,
    stageRow,
    counsellorRow,
    enquiryRows,
    tagRows,
    enrolmentRow,
  ] = await Promise.all([
    lead.centerId
      ? db.select({ name: centers.name }).from(centers).where(eq(centers.id, lead.centerId))
      : Promise.resolve([]),
    lead.stageId
      ? db
          .select({ name: pipelineStages.name, type: pipelineStages.stageType })
          .from(pipelineStages)
          .where(eq(pipelineStages.id, lead.stageId))
      : Promise.resolve([]),
    lead.assignedTo
      ? db.select({ name: profiles.fullName }).from(profiles).where(eq(profiles.id, lead.assignedTo))
      : Promise.resolve([]),
    db
      .select({ source: enquiries.source, receivedAt: enquiries.receivedAt })
      .from(enquiries)
      .where(eq(enquiries.leadId, leadId))
      .orderBy(asc(enquiries.receivedAt)),
    db
      .select({ name: tags.name })
      .from(leadTags)
      .innerJoin(tags, eq(tags.id, leadTags.tagId))
      .where(eq(leadTags.leadId, leadId)),
    db
      .select()
      .from(enrolments)
      .where(and(eq(enrolments.leadId, leadId), isNull(enrolments.deletedAt))),
  ]);

  const enrolment = enrolmentRow[0] ?? null;

  const [instalmentRows, paymentRows, studentRow] = await Promise.all([
    enrolment
      ? db
          .select()
          .from(enrolmentInstalments)
          .where(eq(enrolmentInstalments.enrolmentId, enrolment.id))
          .orderBy(asc(enrolmentInstalments.sequence))
      : Promise.resolve([]),
    enrolment
      ? db
          .select({
            id: payments.id,
            amountPaise: payments.amountPaise,
            direction: payments.direction,
            method: payments.method,
            receivedAt: payments.receivedAt,
            receiptNo: receipts.receiptNo,
          })
          .from(payments)
          .leftJoin(receipts, eq(receipts.paymentId, payments.id))
          .where(eq(payments.enrolmentId, enrolment.id))
          .orderBy(asc(payments.receivedAt))
      : Promise.resolve([]),
    enrolment?.studentId
      ? db
          .select({
            code: students.studentCode,
            status: students.status,
            joinedAt: students.joinedAt,
            course: students.currentCourse,
            batch: batches.name,
          })
          .from(students)
          .leftJoin(batches, eq(batches.id, students.currentBatchId))
          .where(eq(students.id, enrolment.studentId))
      : Promise.resolve([]),
  ]);

  const paidPaise = paymentRows.reduce(
    (sum, row) => sum + (row.direction === "credit" ? row.amountPaise : -row.amountPaise),
    0,
  );
  const firstEnquiryAt = enquiryRows[0]?.receivedAt ?? lead.createdAt;
  const firstPaymentAt = paymentRows.find((row) => row.direction === "credit")?.receivedAt ?? null;

  return {
    profile: {
      leadNumber: lead.leadNumber,
      name: lead.studentName,
      // An admin holds lead.reveal_phone, so this is the full number for
      // them and masked for anybody else who somehow reaches this tool.
      phone: canRevealPhone ? lead.primaryPhone : maskPhone(lead.primaryPhone),
      parentPhone: canRevealPhone ? lead.parentPhone : maskPhone(lead.parentPhone),
      email: lead.email,
      city: lead.city,
      district: lead.district,
      state: lead.state,
      school: lead.schoolCollege,
      educationStatus: lead.educationStatus,
      interestedExams: lead.interestedExams,
      coursesInterested: lead.coursesInterested,
      examYear: lead.examYear,
      centre: centreRow[0]?.name ?? null,
      counsellor: counsellorRow[0]?.name ?? null,
      stage: stageRow[0]?.name ?? null,
      temperature: lead.temperature,
      tags: tagRows.map((row) => row.name),
    },
    enquiry: {
      firstEnquiryAt: firstEnquiryAt?.toISOString() ?? null,
      firstTouchSource: lead.firstTouchSource,
      lastTouchSource: lead.lastTouchSource,
      enquiryCount: enquiryRows.length,
      allEnquiries: enquiryRows.map((row) => ({
        source: row.source,
        at: row.receivedAt?.toISOString() ?? null,
      })),
    },
    admission: enrolment
      ? {
          course: enrolment.course,
          mode: enrolment.mode,
          academicYear: enrolment.academicYear,
          confirmedAt: enrolment.salesToAccountsAt?.toISOString() ?? null,
          daysFromEnquiryToAdmission: daysBetween(firstEnquiryAt, enrolment.salesToAccountsAt),
          daysFromEnquiryToFirstPayment: daysBetween(firstEnquiryAt, firstPaymentAt),
          dropped: enrolment.droppedAt !== null,
          droppedAt: enrolment.droppedAt?.toISOString() ?? null,
          dropReason: enrolment.dropReason,
        }
      : null,
    fees: enrolment
      ? {
          totalFee: formatINR(enrolment.totalFeePaise),
          discount: formatINR(enrolment.discountPaise),
          discountName: enrolment.discountName,
          netFee: formatINR(enrolment.netFeePaise),
          downPayment: formatINR(enrolment.downPaymentPaise),
          notes: enrolment.feeNotes,
          instalments: instalmentRows.map((row) => ({
            sequence: row.sequence,
            dueDate: row.dueDate,
            amount: formatINR(row.amountPaise),
          })),
        }
      : null,
    payments: enrolment
      ? {
          totalPaid: formatINR(paidPaise),
          balance: formatINR(enrolment.netFeePaise - paidPaise),
          entries: paymentRows.map((row) => ({
            at: row.receivedAt?.toISOString() ?? null,
            amount: formatINR(row.direction === "credit" ? row.amountPaise : -row.amountPaise),
            method: row.method,
            receiptNo: row.receiptNo ?? null,
            isReversal: row.direction === "debit",
          })),
        }
      : null,
    student: studentRow[0]
      ? {
          studentCode: studentRow[0].code,
          // The answer to "are they currently studying with us".
          status: studentRow[0].status,
          isActive: studentRow[0].status === "active",
          joinedAt: studentRow[0].joinedAt?.toISOString() ?? null,
          course: studentRow[0].course,
          batch: studentRow[0].batch,
        }
      : null,
  };
}

/** Both tools refuse anybody without org-wide report access — see the module comment. */
export function refuseUnlessOrgWide(ctx: AnalystContext): typeof SCOPE_REFUSAL | null {
  return analystScope(ctx.user) === "all" ? null : SCOPE_REFUSAL;
}

/** Kept next to the tools so the count query and the tool never drift apart. */
export async function countPeopleMatching(query: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(isNull(leads.deletedAt), ilike(leads.studentName, `%${query.trim()}%`)));
  return row?.total ?? 0;
}
