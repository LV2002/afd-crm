import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { companyHolidays, employeeOptionalHolidays, employees } from "@/lib/db/schema";
import { getCenterOptions } from "@/lib/hr/queries";
import { loadPolicy } from "@/lib/hr/service";
import { and, asc, eq, isNull } from "drizzle-orm";

import { ResetOptionalButton } from "../comp-forms";
import { HolidayForm, PolicyForm, RemoveHolidayButton } from "../hr-forms";
import { PayrollSettingsForm } from "../payroll/payroll-forms";
import { loadPayrollSettings } from "@/lib/payroll/service";
import { dayText } from "../leave-ui";

export const dynamic = "force-dynamic";

export default async function PolicyPage() {
  const user = await getCurrentUser();
  if (!user || !(can(user, "hr.manage") || can(user, "payroll.manage"))) return <AccessDenied />;
  const canHr = can(user, "hr.manage");
  const canPayroll = can(user, "payroll.manage");
  const [policy, centers, holidays, payroll, picks] = await Promise.all([
    loadPolicy(db),
    getCenterOptions(),
    db.select().from(companyHolidays).where(and(isNull(companyHolidays.deletedAt))).orderBy(asc(companyHolidays.onDate)),
    loadPayrollSettings(db),
    db
      .select({
        employeeId: employeeOptionalHolidays.employeeId,
        employeeName: employees.name,
        year: employeeOptionalHolidays.year,
        holiday: companyHolidays.name,
        onDate: companyHolidays.onDate,
      })
      .from(employeeOptionalHolidays)
      .innerJoin(employees, eq(employees.id, employeeOptionalHolidays.employeeId))
      .innerJoin(companyHolidays, eq(companyHolidays.id, employeeOptionalHolidays.holidayId))
      .orderBy(asc(companyHolidays.onDate), asc(employees.name)),
  ]);
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-8">
      {canPayroll && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Payroll rules</h2>
          <PayrollSettingsForm s={payroll} />
        </section>
      )}
      {canHr && (<>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Leave policy</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Leave resets on 1 January with no carry over. In the year somebody joins, their leave is the annual figure for the
          months left, to the nearest half day.
        </p>
        <PolicyForm policy={policy} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Company holidays</h2>
        <p className="text-sm text-muted-foreground">Not counted as leave days, and shown on everybody&apos;s page. Tick <em>Optional</em> for holidays each person may take only one of (such as Good Friday, Diwali or Muharram): staff choose theirs on their own HR page, and the rest close to them for the year.</p>
        <HolidayForm centers={centers} />
        <ul className="flex flex-col gap-1.5 text-sm">
          {holidays.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3">
              <span>
                {dayText(h.onDate)} — {h.name}
                {h.centerId ? ` (${centers.find((c) => c.id === h.centerId)?.name ?? "one centre"})` : ""}
                {h.isOptional ? " · optional" : ""}
              </span>
              <RemoveHolidayButton holidayId={h.id} />
            </li>
          ))}
          {holidays.length === 0 && <li className="text-muted-foreground">None yet.</li>}
        </ul>
      </section>

      {holidays.some((h) => h.isOptional) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Who took which optional holiday</h2>
          {picks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has chosen yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {picks.map((p) => (
                <li key={`${p.employeeId}-${p.year}`} className="flex flex-wrap items-center gap-3">
                  <span>
                    {p.employeeName} — {p.holiday} ({dayText(p.onDate)})
                  </span>
                  {p.onDate > today && <ResetOptionalButton employeeId={p.employeeId} year={p.year} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      </>)}
    </div>
  );
}
