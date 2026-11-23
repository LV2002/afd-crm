"use server";

import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { employees, enrolments, leads, payslips, students } from "@/lib/db/schema";
import { formatINR } from "@/lib/format/currency";
import { paymentStatuses } from "@/lib/payroll/service";

/**
 * The searches behind the "whose is this?" pickers on the bank screen. Each
 * runs on the direct database client, so each applies the caller's own
 * limits here: a counsellor-scoped or centre-scoped person finds only the
 * students they could record a payment for.
 */

export interface PayeeOption {
  id: string;
  label: string;
  detail: string;
}

const LIMIT = 8;

function like(q: string): string {
  return `%${q.trim().replace(/[%_\\]/g, "\\$&")}%`;
}

/** A student's admission, to record their fee against. Includes admissions still waiting for a first payment (a pre-booking). */
export async function searchEnrolments(query: string): Promise<PayeeOption[]> {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.record") || !can(user, "payment.record")) return [];
  const scope = scopeFor(user, "payment.record");
  if (!scope || query.trim().length < 2) return [];

  const term = like(query);
  const rows = await db
    .select({
      id: enrolments.id,
      name: leads.studentName,
      phone: leads.primaryPhone,
      course: enrolments.course,
      year: enrolments.academicYear,
      net: enrolments.netFeePaise,
      status: enrolments.status,
      centerId: enrolments.centerId,
      assignedTo: leads.assignedTo,
    })
    .from(enrolments)
    .innerJoin(leads, eq(leads.id, enrolments.leadId))
    .where(
      and(
        isNull(enrolments.deletedAt),
        or(ilike(leads.studentName, term), ilike(leads.primaryPhone, term)),
      ),
    )
    .orderBy(desc(enrolments.createdAt))
    .limit(40);

  return rows
    .filter((r) => scope === "all" || (scope === "center" && user.centerIds.includes(r.centerId)) || (scope === "own" && r.assignedTo === user.id))
    .slice(0, LIMIT)
    .map((r) => ({
      id: r.id,
      label: r.name,
      detail: `${r.course} ${r.year} · fee ${formatINR(r.net)} · ${r.phone}${r.status === "pending_payment" ? " · awaiting first payment" : ""}`,
    }));
}

/** A student on the roster, to tag a fine or a workshop payment to. */
export async function searchStudents(query: string): Promise<PayeeOption[]> {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.record") || query.trim().length < 2) return [];
  const term = like(query);
  const rows = await db
    .select({ id: students.id, name: students.fullName, phone: students.phone, code: students.studentCode, centerId: students.centerId })
    .from(students)
    .where(and(isNull(students.deletedAt), or(ilike(students.fullName, term), ilike(students.phone, term), ilike(students.studentCode, term))))
    .orderBy(students.fullName)
    .limit(40);
  const scope = scopeFor(user, "finance.record");
  return rows
    .filter((r) => scope === "all" || (scope === "center" && user.centerIds.includes(r.centerId)))
    .slice(0, LIMIT)
    .map((r) => ({ id: r.id, label: r.name, detail: `${r.code} · ${r.phone}` }));
}

/** An employee's payslip for a month, to mark paid by this bank line. */
export async function searchPayslips(query: string): Promise<PayeeOption[]> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.generate")) return [];
  const term = like(query);
  const rows = await db
    .select({ id: payslips.id, name: employees.name, empNo: employees.empNo, month: payslips.month, net: payslips.netPaise })
    .from(payslips)
    .innerJoin(employees, eq(employees.id, payslips.employeeId))
    .where(and(eq(payslips.status, "current"), query.trim() ? or(ilike(employees.name, term), ilike(employees.empNo, term)) : sql`true`))
    .orderBy(desc(payslips.month), employees.name)
    .limit(30);
  const status = await paymentStatuses(db, rows.map((r) => ({ id: r.id, netPaise: r.net })));
  return rows
    .map((r) => ({ r, s: status.get(r.id) }))
    .sort((a, b) => Number((b.s?.remainingPaise ?? 0) > 0) - Number((a.s?.remainingPaise ?? 0) > 0))
    .slice(0, 12)
    .map(({ r, s }) => ({
      id: r.id,
      label: `${r.name} — ${r.month}`,
      detail: `net ${formatINR(r.net)} · ${s && s.remainingPaise > 0 ? `${formatINR(s.remainingPaise)} still to pay` : "already paid"}`,
    }));
}
