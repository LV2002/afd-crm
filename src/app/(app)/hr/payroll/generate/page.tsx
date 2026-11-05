import { and, eq } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { employeePay, employees, payslips } from "@/lib/db/schema";
import { formatINR } from "@/lib/format/currency";
import { loadPolicy } from "@/lib/hr/service";
import { approvedLeaveEntries, previousClosing } from "@/lib/payroll/service";
import { loadAttendanceReport } from "@/lib/attendance/load";
import { resolveOpening } from "@/lib/payroll/calc";

import { GenerateForm, type EntryRow } from "../payroll-forms";

export const dynamic = "force-dynamic";

const rupees = (p: number | undefined) => (p ? String(p / 100) : "");

export default async function GeneratePage({ searchParams }: { searchParams: Promise<{ month?: string; employee?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.generate")) return <AccessDenied />;
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7);
  const employeeId = sp.employee ?? "";

  const people = await db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.status, "active")).orderBy(employees.name);

  let locked: Array<{ date: string; type: string; notes: string }> = [];
  let suggested: EntryRow[] = [];
  let broughtForward = null;
  let existing = null;

  if (employeeId) {
    const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
    const [pay] = await db.select().from(employeePay).where(eq(employeePay.employeeId, employeeId));
    if (emp) {
      locked = (await approvedLeaveEntries(db, emp.id, month)).map((e) => ({ date: e.date, type: e.type, notes: e.notes ?? "" }));
      const leave = await loadPolicy(db);
      const prev = await previousClosing(db, emp.id, month);
      const open = resolveOpening({
        month,
        previous: prev ? { month: prev.month, sl: prev.slClosing, cl: prev.clClosing, advancePaise: prev.advanceClosingPaise } : null,
        employee: { dateOfJoining: emp.dateOfJoining, openingSl: emp.openingSl, openingCl: emp.openingCl, openingAsOf: emp.openingAsOf, openingAdvancePaise: pay?.openingAdvancePaise ?? 0 },
        leave,
      });
      broughtForward = { sl: open.sl, cl: open.cl, advance: formatINR(open.advancePaise) };

      const [cur] = await db.select().from(payslips).where(and(eq(payslips.employeeId, emp.id), eq(payslips.month, month), eq(payslips.status, "current")));
      if (cur) {
        const inp = cur.inputs as { money?: Record<string, number>; manualEntries?: Array<{ date: string; type: string; minutes?: number; notes?: string }>; revision?: { effectiveDate: string; newDesignation?: string | null; newComponents: Record<string, number> } | null };
        existing = {
          money: Object.fromEntries(Object.entries(inp.money ?? {}).map(([k, v]) => [k, rupees(v)])),
          promotion: inp.revision
            ? { date: inp.revision.effectiveDate, designation: inp.revision.newDesignation ?? "", basic: rupees(inp.revision.newComponents.basic), hra: rupees(inp.revision.newComponents.hra), other: rupees(inp.revision.newComponents.other), medical: rupees(inp.revision.newComponents.medical) }
            : null,
        };
        suggested = (inp.manualEntries ?? []).map((e) => ({ date: e.date, type: e.type, minutes: e.minutes ? String(e.minutes) : "", notes: e.notes ?? "" }));
      }
    }
  }

  // With no payslip yet, offer what the biometric punches suggest. Approved
  // leave is left out (it is already fixed), and the person confirms the rest.
  let fromBiometrics = false;
  if (employeeId && suggested.length === 0 && !existing) {
    const report = await loadAttendanceReport(db, employeeId, month);
    if (report) {
      const lockedDates = new Set(locked.map((l) => l.date));
      suggested = report.suggestions
        .filter((s) => !lockedDates.has(s.date))
        .map((s) => ({ date: s.date, type: s.type, minutes: s.minutes ? String(s.minutes) : "", notes: s.notes ?? "" }));
      fromBiometrics = suggested.length > 0;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Generate a payslip</h2>
      {fromBiometrics && (
        <p className="max-w-3xl rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          The rows below are suggested by the biometric punches (late, early, one punch, no punch). A missing punch is as likely to be a flat
          battery as an absence: check each before generating, and remove any that are wrong.
        </p>
      )}
      <form className="flex flex-wrap items-end gap-2">
        <select name="employee" defaultValue={employeeId} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="">Choose an employee…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input name="month" type="month" defaultValue={month} className="h-9 rounded-md border bg-background px-3 text-sm" />
        <button type="submit" className="h-9 rounded-md border px-3 text-sm">Load</button>
      </form>
      <GenerateForm
        key={`${employeeId}-${month}`}
        month={month}
        employeeId={employeeId}
        employees={people}
        canManage={can(user, "payroll.manage")}
        locked={locked}
        suggested={suggested}
        existing={existing}
        broughtForward={broughtForward}
      />
    </div>
  );
}
