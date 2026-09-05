import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import {
  enrolmentInstalments,
  enrolments,
  leads,
  paymentReminderRules,
  paymentRemindersSent,
  payments,
  students,
} from "@/lib/db/schema";
import { allocatePayments } from "@/lib/finance/allocate";
import {
  describeTiming,
  dueReminders,
  reminderKey,
  supersededRules,
  type OutstandingInstalment,
  type ReminderRule,
} from "@/lib/finance/reminder-schedule";
import { formatINR } from "@/lib/format/currency";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { sendTemplateMessage } from "@/lib/integrations/whatsapp/client";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { notify } from "@/lib/notifications/notify";
import { suppressedAmong } from "@/lib/whatsapp/opt-out";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Chases overdue fees.
 *
 * The Collections screen has shown who is late since the finance module
 * shipped and nothing has ever contacted them. This does, on a ladder an
 * admin configures in Settings → Payment Reminders.
 *
 * Four things it deliberately will not do:
 *
 *  - **Message the same person twice about the same instalment.** Every
 *    rung fired is a row in `payment_reminders_sent` with a unique index
 *    on (instalment, rung), and the schedule skips anything already there.
 *  - **Chase a dropped student.** A dropped enrolment is excluded in SQL.
 *    Somebody who left is not a debtor to badger.
 *  - **Message somebody who said STOP.** The suppression list is re-read
 *    every run, exactly as the broadcast sweep does — "we had already
 *    decided to message them" is not a defence anybody accepts.
 *  - **Fire four rungs at once** when a ladder is switched on against a
 *    student who is months late. One rung per instalment per run, and the
 *    ones it overtook are recorded as skipped. See reminder-schedule.ts.
 *
 * A failed WhatsApp send is RECORDED rather than retried: a template Meta
 * rejects will be rejected identically tomorrow, and every attempt costs
 * money. The row says what went wrong and a person decides.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Asia/Kolkata, because "overdue by three days" is counted in the days
  // the institute lives in, not in UTC.
  const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  const ruleRows = await db
    .select()
    .from(paymentReminderRules)
    .where(and(eq(paymentReminderRules.isActive, true), isNull(paymentReminderRules.deletedAt)));

  if (ruleRows.length === 0) {
    return NextResponse.json({ asOf, rules: 0, sent: 0, skipped: 0, failed: 0 });
  }

  const rules: ReminderRule[] = ruleRows.map((row) => ({
    id: row.id,
    name: row.name,
    daysAfterDue: row.daysAfterDue,
    channel: row.channel === "whatsapp" ? "whatsapp" : "notification",
    templateName: row.templateName,
    templateLanguage: row.templateLanguage,
  }));

  // Live admissions only: past the sales→accounts gate, not dropped, not
  // deleted. A dropped student is not somebody to chase for money.
  const liveEnrolments = await db
    .select({
      id: enrolments.id,
      leadId: enrolments.leadId,
      centerId: enrolments.centerId,
      course: enrolments.course,
      studentId: enrolments.studentId,
    })
    .from(enrolments)
    .where(and(isNull(enrolments.deletedAt), isNull(enrolments.droppedAt)));

  if (liveEnrolments.length === 0) {
    return NextResponse.json({ asOf, rules: rules.length, sent: 0, skipped: 0, failed: 0 });
  }

  const enrolmentIds = liveEnrolments.map((row) => row.id);
  const [instalmentRows, paymentRows] = await Promise.all([
    db
      .select()
      .from(enrolmentInstalments)
      .where(inArray(enrolmentInstalments.enrolmentId, enrolmentIds)),
    db
      .select({
        id: payments.id,
        enrolmentId: payments.enrolmentId,
        amountPaise: payments.amountPaise,
        direction: payments.direction,
        receivedAt: payments.receivedAt,
      })
      .from(payments)
      .where(inArray(payments.enrolmentId, enrolmentIds)),
  ]);

  // What is still owed per instalment, worked out by the same allocation
  // the Collections screen uses — so the two can never disagree about who
  // is late.
  const outstanding: OutstandingInstalment[] = [];
  const enrolmentByInstalment = new Map<string, (typeof liveEnrolments)[number]>();

  for (const enrolment of liveEnrolments) {
    const schedule = instalmentRows
      .filter((row) => row.enrolmentId === enrolment.id)
      .map((row) => ({
        id: row.id,
        sequence: row.sequence,
        dueDate: row.dueDate,
        amountPaise: row.amountPaise,
      }));
    if (schedule.length === 0) continue;

    const received = paymentRows
      .filter((row) => row.enrolmentId === enrolment.id)
      .map((row) => ({
        id: row.id,
        // A debit is a reversal or refund: it puts the money back on the
        // schedule, so somebody whose payment bounced becomes overdue
        // again rather than staying quietly settled.
        amountPaise: row.direction === "credit" ? row.amountPaise : -row.amountPaise,
        receivedOn: row.receivedAt.toISOString().slice(0, 10),
      }));

    for (const settled of allocatePayments(schedule, received, asOf).instalments) {
      if (settled.outstandingPaise <= 0) continue;
      outstanding.push({
        instalmentId: settled.id,
        enrolmentId: enrolment.id,
        dueDate: settled.dueDate,
        outstandingPaise: settled.outstandingPaise,
      });
      enrolmentByInstalment.set(settled.id, enrolment);
    }
  }

  const sentRows = outstanding.length
    ? await db
        .select({
          instalmentId: paymentRemindersSent.instalmentId,
          ruleId: paymentRemindersSent.ruleId,
        })
        .from(paymentRemindersSent)
        .where(
          inArray(
            paymentRemindersSent.instalmentId,
            outstanding.map((row) => row.instalmentId),
          ),
        )
    : [];
  const alreadySent = new Set(sentRows.map((row) => reminderKey(row.instalmentId, row.ruleId)));

  const due = dueReminders(outstanding, rules, alreadySent, asOf);
  if (due.length === 0) {
    return NextResponse.json({ asOf, rules: rules.length, sent: 0, skipped: 0, failed: 0 });
  }

  // Names and numbers for the people being chased, in one round trip each.
  const dueEnrolmentIds = [...new Set(due.map((row) => row.instalment.enrolmentId))];
  const dueEnrolments = liveEnrolments.filter((row) => dueEnrolmentIds.includes(row.id));
  const leadRows = await db
    .select({
      id: leads.id,
      studentName: leads.studentName,
      primaryPhone: leads.primaryPhone,
      assignedTo: leads.assignedTo,
      doNotContact: leads.doNotContact,
    })
    .from(leads)
    .where(inArray(leads.id, dueEnrolments.map((row) => row.leadId)));
  const leadById = new Map(leadRows.map((row) => [row.id, row]));

  const studentIds = dueEnrolments
    .map((row) => row.studentId)
    .filter((id): id is string => id !== null);
  const studentRows = studentIds.length
    ? await db
        .select({ id: students.id, fullName: students.fullName, phone: students.phone })
        .from(students)
        .where(inArray(students.id, studentIds))
    : [];
  const studentById = new Map(studentRows.map((row) => [row.id, row]));

  // Re-read every run, not cached: somebody can send STOP between last
  // night's sweep and this one.
  const phones = leadRows.map((row) => row.primaryPhone).filter((p): p is string => Boolean(p));
  const suppressed = await suppressedAmong(db, phones);

  const credentials = await getIntegrationCredentials("whatsapp", [
    "access_token",
    "phone_number_id",
  ]);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const reminder of due) {
    const enrolment = enrolmentByInstalment.get(reminder.instalment.instalmentId);
    if (!enrolment) continue;
    const lead = leadById.get(enrolment.leadId);
    const student = enrolment.studentId ? studentById.get(enrolment.studentId) : undefined;
    const name = student?.fullName ?? lead?.studentName ?? "the student";
    const timing = describeTiming(reminder.daysOverdue);
    const amount = formatINR(reminder.instalment.outstandingPaise);

    let status: "sent" | "failed" | "skipped" = "sent";
    let detail: string | null = null;

    try {
      if (reminder.rule.channel === "whatsapp") {
        const phone = student?.phone ?? lead?.primaryPhone ?? null;
        const normalised = phone ? normalizePhone(phone) : null;

        if (!normalised) {
          status = "skipped";
          detail = "No phone number on the record.";
        } else if (lead?.doNotContact) {
          status = "skipped";
          detail = "Marked do not contact.";
        } else if (suppressed.has(normalised)) {
          status = "skipped";
          detail = "Opted out of WhatsApp messages.";
        } else if (!credentials.access_token || !credentials.phone_number_id) {
          status = "skipped";
          detail = "WhatsApp isn't connected.";
        } else {
          await sendTemplateMessage(
            credentials.phone_number_id,
            credentials.access_token,
            normalised,
            reminder.rule.templateName!,
            reminder.rule.templateLanguage,
            [name, amount],
          );
        }
      } else {
        // The staff rung. Accounts chase, and the counsellor who sold the
        // admission is usually the one the family actually answers.
        await notify({
          eventKey: "payment.overdue",
          context: {
            student_name: name,
            amount,
            days_overdue: String(Math.max(0, reminder.daysOverdue)),
            due_date: reminder.instalment.dueDate,
            course: enrolment.course,
          },
          href: `/accounts/${enrolment.id}`,
          entityType: "enrolments",
          entityId: enrolment.id,
          centerId: enrolment.centerId,
          ownerId: lead?.assignedTo ?? null,
        });
      }
    } catch (error) {
      status = "failed";
      detail = error instanceof Error ? error.message : String(error);
    }

    // Recorded whatever happened — including a failure, which is NOT
    // retried tomorrow. See the module comment.
    await db
      .insert(paymentRemindersSent)
      .values({
        instalmentId: reminder.instalment.instalmentId,
        ruleId: reminder.rule.id,
        channel: reminder.rule.channel,
        status,
        detail: detail ?? `${timing} · ${amount}`,
      })
      .onConflictDoNothing({
        target: [paymentRemindersSent.instalmentId, paymentRemindersSent.ruleId],
      });

    // Rungs this one overtook are written off, or the next run would send
    // a "7 days overdue" message to somebody three months late.
    for (const overtaken of supersededRules(reminder, rules, alreadySent)) {
      await db
        .insert(paymentRemindersSent)
        .values({
          instalmentId: reminder.instalment.instalmentId,
          ruleId: overtaken.id,
          channel: overtaken.channel,
          status: "skipped",
          detail: `Overtaken by "${reminder.rule.name}".`,
        })
        .onConflictDoNothing({
          target: [paymentRemindersSent.instalmentId, paymentRemindersSent.ruleId],
        });
    }

    if (status === "sent") sent += 1;
    else if (status === "failed") failed += 1;
    else skipped += 1;
  }

  return NextResponse.json({ asOf, rules: rules.length, due: due.length, sent, skipped, failed });
}
