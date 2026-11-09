import Link from "next/link";

import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { AccessDenied } from "@/components/layout/access-denied";
import { getCompRequests, getDirectReports, getRequests, balanceFor } from "@/lib/hr/queries";
import { optionalChoices } from "@/lib/hr/optional-holidays";
import { employeeForUser, loadHolidays } from "@/lib/hr/service";
import { payslips } from "@/lib/db/schema";
import { loadPayrollSettings } from "@/lib/payroll/service";
import { formatINR } from "@/lib/format/currency";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { CompCancelButton, CompDayForm, CompDecideButtons, TakeOptionalButton } from "../comp-forms";
import { ApplyLeaveForm, CancelButton, DecideButtons } from "../hr-forms";
import { BalanceCards, StatusBadge, dayText, kindText, rangeText } from "../leave-ui";

export const dynamic = "force-dynamic";

/** Everything an employee needs in one place: their leave, the company holidays, and what is waiting on them. */
export default async function MyHrPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const showAll = (await searchParams).all === "1";
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.self")) return <AccessDenied />;

  const employee = await employeeForUser(db, user.id);
  const reports = await getDirectReports(user.id);
  const isHr = can(user, "hr.manage");

  // What waits on this person: their reports' pending requests, and, for HR, every pending request.
  const awaiting = (await getRequests({ status: "pending" })).filter(
    (r) => r.employeeId !== employee?.id && (isHr || reports.some((p) => p.id === r.employeeId)),
  );

  const awaitingComp = (await getCompRequests({ status: "pending" })).filter(
    (r) => r.employeeId !== employee?.id && (isHr || reports.some((p) => p.id === r.employeeId)),
  );

  if (!employee) {
    return (
      <div className="flex flex-col gap-6">
        <p className="max-w-xl rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Your login isn&apos;t linked to an employee record yet, so there is no leave to show. Ask HR to add you.
        </p>
        {(awaiting.length > 0 || awaitingComp.length > 0) && <Awaiting rows={awaiting} comp={awaitingComp} />}
      </div>
    );
  }

  const year = new Date().getFullYear();
  const [balance, mine, holidays, myComp, optional] = await Promise.all([
    balanceFor(employee, year),
    getRequests({ employeeId: employee.id, limit: 50 }),
    loadHolidays(db, employee.centerId, employee.id),
    getCompRequests({ employeeId: employee.id, limit: 20 }),
    optionalChoices(db, employee.id, employee.centerId, new Date().getFullYear()),
  ]);
  const payroll = await loadPayrollSettings(db);
  const mySlips = await db
    .select()
    .from(payslips)
    .where(
      and(
        eq(payslips.employeeId, employee.id),
        eq(payslips.status, "current"),
        payroll.requireApproval ? isNotNull(payslips.approvedAt) : undefined,
      ),
    )
    .orderBy(desc(payslips.month))
    .limit(36);
  // Payslips made but not yet approved: the employee is told one is on its way, not shown it.
  const waitingMonths = payroll.requireApproval
    ? (
        await db
          .select({ month: payslips.month })
          .from(payslips)
          .where(and(eq(payslips.employeeId, employee.id), eq(payslips.status, "current"), isNull(payslips.approvedAt)))
          .orderBy(desc(payslips.month))
      ).map((r) => r.month)
    : [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = holidays.filter((h) => h.onDate >= today).slice(0, 12);

  const requests = showAll ? mine : mine.slice(0, 5);
  const slips = showAll ? mySlips : mySlips.slice(0, 6);
  const more = mine.length > 5 || mySlips.length > 6;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* Left: what you do. Right: where you stand, always in view. */}
      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex flex-col gap-0.5">
          <h2 className="text-lg font-semibold">{employee.name}</h2>
          <p className="text-sm text-muted-foreground">
            {[employee.designation, employee.department, employee.empNo].filter(Boolean).join(" · ")}
          </p>
        </section>

        {(awaiting.length > 0 || awaitingComp.length > 0) && <Awaiting rows={awaiting} comp={awaitingComp} />}

        <details className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
            Apply for leave
            <span className="text-xs font-normal text-muted-foreground group-open:hidden">Open the form</span>
          </summary>
          <div className="border-t p-4">
            <ApplyLeaveForm />
          </div>
        </details>

        <details className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
            Request a comp working day
            <span className="text-xs font-normal text-muted-foreground group-open:hidden">Work a day off, take another</span>
          </summary>
          <div className="border-t p-4">
            <CompDayForm />
          </div>
        </details>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">My requests</h3>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-t first:border-t-0">
                      <td className="p-2">
                        <Link href={`/hr/leave/${r.id}`} className="underline">
                          #{r.leaveNo}
                        </Link>
                      </td>
                      <td className="p-2">{kindText(r.kind)}</td>
                      <td className="p-2">{rangeText(r)}</td>
                      <td className="p-2">{r.days}d</td>
                      <td className="p-2">
                        <StatusBadge status={r.status} />
                        {r.decisionNote && <span className="ml-2 text-xs text-muted-foreground">{r.decisionNote}</span>}
                      </td>
                      <td className="p-2">
                        {(r.status === "pending" || (r.status === "approved" && r.fromDate > today)) && <CancelButton requestId={r.id} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {myComp.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">My comp working days</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <tbody>
                  {myComp.slice(0, showAll ? 20 : 3).map((r) => (
                    <tr key={r.id} className="border-t first:border-t-0">
                      <td className="p-2">
                        Work {dayText(r.workDate)} ({r.workPart === "half" ? "half day" : "full day"}) · off {dayText(r.offDate)} ({r.offPart === "half" ? "half day" : "full day"})
                      </td>
                      <td className="p-2">
                        <StatusBadge status={r.status} />
                        {r.decisionNote && <span className="ml-2 text-xs text-muted-foreground">{r.decisionNote}</span>}
                      </td>
                      <td className="p-2">{(r.status === "pending" || (r.status === "approved" && r.workDate > today && r.offDate > today)) && <CompCancelButton requestId={r.id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Payslips</h3>
          {waitingMonths.length > 0 && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Your payslip for{" "}
              {waitingMonths
                .map((m) => new Date(`${m}-01T12:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }))
                .join(", ")}{" "}
              {waitingMonths.length === 1 ? "has" : "have"} been prepared and will appear here as soon as it is approved.
            </p>
          )}
          {slips.length === 0 && waitingMonths.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your salary slips appear here once they have been approved.</p>
          ) : slips.length === 0 ? null : (
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {slips.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <Link href={`/hr/payroll/${s.id}`} className="underline">
                    {new Date(`${s.month}-01T12:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
                  </Link>
                  <span className="text-muted-foreground">{formatINR(s.netPaise)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {more && (
          <Link href={showAll ? "/hr/me" : "/hr/me?all=1"} className="w-fit text-sm font-medium underline">
            {showAll ? "Show less" : "Show all requests and payslips"}
          </Link>
        )}
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-20">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">My leave</h3>
          <BalanceCards balance={balance} stacked />
          {balance.lopDays > 0 && <p className="text-xs text-muted-foreground">Loss of pay and half days this year: {balance.lopDays} days.</p>}
        </section>

        {optional.options.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold">Optional holiday {optional.year}</h3>
            <p className="text-xs text-muted-foreground">
              {optional.chosen ? `You took ${optional.chosen.name}. The others are closed for the year.` : "Take one of these. Once you do, the rest are closed to you."}
            </p>
            <ul className="text-sm">
              {optional.options.map((o) => {
                const isMine = optional.chosen?.id === o.id;
                const closed = Boolean(optional.chosen) && !isMine;
                const passed = o.onDate <= today;
                return (
                  <li key={o.id} className={`flex items-center justify-between gap-3 py-1 ${closed ? "text-muted-foreground line-through" : ""}`}>
                    <span>
                      {o.name} <span className="text-muted-foreground">· {dayText(o.onDate)}</span>
                    </span>
                    {isMine ? (
                      <span className="text-xs font-medium">Yours</span>
                    ) : !optional.chosen && !passed ? (
                      <TakeOptionalButton holidayId={o.id} name={o.name} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold">My attendance</h3>
          <Link href="/hr/me/attendance" className="text-sm underline">
            See my punch in and out times
          </Link>
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold">Coming holidays</h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">None coming up.</p>
          ) : (
            <ul className="text-sm">
              {upcoming.slice(0, 5).map((h) => (
                <li key={`${h.onDate}-${h.name}`} className="flex justify-between gap-3 py-0.5">
                  <span>{h.name}</span>
                  <span className="text-muted-foreground">{dayText(h.onDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Awaiting({ rows, comp }: { rows: Awaited<ReturnType<typeof getRequests>>; comp: Awaited<ReturnType<typeof getCompRequests>> }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Waiting for your approval ({rows.length + comp.length})</h3>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-sm">
              <span className="font-medium">{r.employeeName}</span> · {kindText(r.kind)} · {rangeText(r)} · {r.days} day{r.days === 1 ? "" : "s"}
            </p>
            {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
            <DecideButtons requestId={r.id} />
          </div>
        ))}
        {comp.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-sm">
              <span className="font-medium">{r.employeeName}</span> · comp working day · works {dayText(r.workDate)} ({r.workPart === "half" ? "half day" : "full day"}) · off{" "}
              {dayText(r.offDate)} ({r.offPart === "half" ? "half day" : "full day"})
            </p>
            {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
            <CompDecideButtons requestId={r.id} />
          </div>
        ))}
      </div>
    </section>
  );
}
