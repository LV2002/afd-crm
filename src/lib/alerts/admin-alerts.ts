import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { leads, notifications, students } from "@/lib/db/schema";
import { daysBetweenDates, type OutstandingInstalment } from "@/lib/finance/reminder-schedule";
import { loadOutstandingInstalments } from "@/lib/finance/outstanding-instalments";
import { formatINR } from "@/lib/format/currency";
import { loadTemperatureOptionsDirect } from "@/lib/leads/temperature-options-direct";
import { notify } from "@/lib/notifications/notify";

/**
 * The two things the admin is told about on a schedule rather than when
 * somebody does something: money a month late, and an enquiry nobody has
 * touched in a week. Both are told once per instalment / per lead, and only
 * to whoever the event is configured for (the admin, by default).
 *
 * The earlier steps stay where they were. A fee reminder rung still tells
 * the counsellor and accounts; an SLA breach still tells the centre head.
 * The admin hears when it has gone past the point those people should have
 * dealt with it.
 */

/** Days past the due date before the admin is told. */
export const ADMIN_OVERDUE_DAYS = 30;
/** Days a lead may sit untouched before the admin is told. */
export const ADMIN_UNCONTACTED_DAYS = 7;
/**
 * At most this many of each per run. The first run after this ships meets
 * every instalment and lead that is already past the mark; spreading them
 * over a few mornings is kinder than one bell with two hundred entries.
 */
export const PER_RUN_CAP = 30;

/** Instalments that are at least `minDays` past due, oldest first. Pure. */
export function severelyOverdue(
  outstanding: OutstandingInstalment[],
  asOf: string,
  minDays: number,
): Array<OutstandingInstalment & { daysOverdue: number }> {
  return outstanding
    .map((o) => ({ ...o, daysOverdue: daysBetweenDates(o.dueDate, asOf) }))
    .filter((o) => o.daysOverdue >= minDays)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

async function alreadyTold(eventKey: string, entityIds: string[]): Promise<Set<string>> {
  if (entityIds.length === 0) return new Set();
  const rows = await db
    .select({ entityId: notifications.entityId })
    .from(notifications)
    .where(and(eq(notifications.eventKey, eventKey), inArray(notifications.entityId, entityIds)));
  return new Set(rows.flatMap((r) => (r.entityId ? [r.entityId] : [])));
}

export async function alertOverduePayments(asOf: string): Promise<number> {
  const { outstanding, enrolmentByInstalment } = await loadOutstandingInstalments(asOf);
  const late = severelyOverdue(outstanding, asOf, ADMIN_OVERDUE_DAYS);
  if (late.length === 0) return 0;

  const told = await alreadyTold("payment.overdue_severe", late.map((l) => l.instalmentId));
  const todo = late.filter((l) => !told.has(l.instalmentId)).slice(0, PER_RUN_CAP);
  if (todo.length === 0) return 0;

  const enrolments = todo.flatMap((l) => {
    const e = enrolmentByInstalment.get(l.instalmentId);
    return e ? [e] : [];
  });
  const leadRows = await db.select({ id: leads.id, studentName: leads.studentName }).from(leads).where(inArray(leads.id, enrolments.map((e) => e.leadId)));
  const studentIds = enrolments.map((e) => e.studentId).filter((id): id is string => id !== null);
  const studentRows = studentIds.length ? await db.select({ id: students.id, fullName: students.fullName }).from(students).where(inArray(students.id, studentIds)) : [];
  const leadName = new Map(leadRows.map((r) => [r.id, r.studentName]));
  const studentName = new Map(studentRows.map((r) => [r.id, r.fullName]));

  let sent = 0;
  for (const l of todo) {
    const enrolment = enrolmentByInstalment.get(l.instalmentId);
    if (!enrolment) continue;
    await notify({
      eventKey: "payment.overdue_severe",
      context: {
        student_name: (enrolment.studentId && studentName.get(enrolment.studentId)) || leadName.get(enrolment.leadId) || "the student",
        amount: formatINR(l.outstandingPaise),
        days_overdue: String(l.daysOverdue),
        due_date: l.dueDate,
        course: enrolment.course,
      },
      href: `/accounts/${enrolment.id}`,
      entityType: "enrolment_instalments",
      entityId: l.instalmentId,
      centerId: enrolment.centerId,
    });
    sent++;
  }
  return sent;
}

/**
 * Leads still at "Not contacted" a week after they arrived, with nothing
 * logged against them: no call, visit or note, and no WhatsApp message sent.
 * A lead marked do-not-contact is left out, since "get in touch" would be the
 * wrong thing to tell the admin about it.
 */
export async function alertUncontactedLeads(now = new Date()): Promise<number> {
  const options = await loadTemperatureOptionsDirect();
  const newValues = options.filter((o) => o.kind === "new").map((o) => o.value);
  const cutoff = new Date(now.getTime() - ADMIN_UNCONTACTED_DAYS * 86_400_000);

  const rows = await db.execute<{
    id: string;
    lead_number: string | number;
    student_name: string;
    source: string | null;
    center_id: string | null;
    center_name: string | null;
    created_at: string;
  }>(sql`
    select l.id, l.lead_number, l.student_name, l.first_touch_source as source, l.center_id, c.name as center_name, l.created_at
    from leads l
    left join centers c on c.id = l.center_id
    where l.deleted_at is null
      and l.merged_into_lead_id is null
      and l.do_not_contact = false
      and (l.temperature is null${newValues.length ? sql` or l.temperature in (${sql.join(newValues.map((v) => sql`${v}`), sql`, `)})` : sql``})
      and l.created_at <= ${cutoff.toISOString()}::timestamptz
      and not exists (select 1 from interactions i where i.lead_id = l.id)
      and not exists (select 1 from whatsapp_messages m where m.lead_id = l.id and m.direction = 'outbound' and m.deleted_at is null)
      and not exists (select 1 from notifications n where n.event_key = 'lead.uncontacted' and n.entity_id = l.id)
    order by l.created_at asc
    limit ${PER_RUN_CAP}
  `);

  let sent = 0;
  for (const r of rows) {
    const days = Math.floor((now.getTime() - new Date(r.created_at).getTime()) / 86_400_000);
    await notify({
      eventKey: "lead.uncontacted",
      context: {
        lead_name: r.student_name,
        lead_number: String(r.lead_number),
        days_waiting: String(days),
        source: r.source ?? "an unknown source",
        center_name: r.center_name ?? "",
      },
      href: `/leads/${r.id}`,
      entityType: "leads",
      entityId: r.id,
      centerId: r.center_id,
    });
    sent++;
  }
  return sent;
}

export async function runAdminAlerts(now = new Date()): Promise<{ overdue: number; uncontacted: number }> {
  // Asia/Kolkata, because "30 days late" is counted in the days the institute lives in.
  const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  return { overdue: await alertOverduePayments(asOf), uncontacted: await alertUncontactedLeads(now) };
}
