import Link from "next/link";

import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { AccessDenied } from "@/components/layout/access-denied";
import { getDirectReports, getRequests, balanceFor } from "@/lib/hr/queries";
import { employeeForUser, loadHolidays } from "@/lib/hr/service";

import { ApplyLeaveForm, CancelButton, DecideButtons } from "../hr-forms";
import { BalanceCards, StatusBadge, dayText, kindText, rangeText } from "../leave-ui";

export const dynamic = "force-dynamic";

/** Everything an employee needs in one place: their leave, the company holidays, and what is waiting on them. */
export default async function MyHrPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.self")) return <AccessDenied />;

  const employee = await employeeForUser(db, user.id);
  const reports = await getDirectReports(user.id);
  const isHr = can(user, "hr.manage");

  // What waits on this person: their reports' pending requests, and, for HR, every pending request.
  const awaiting = (await getRequests({ status: "pending" })).filter(
    (r) => r.employeeId !== employee?.id && (isHr || reports.some((p) => p.id === r.employeeId)),
  );

  if (!employee) {
    return (
      <div className="flex flex-col gap-6">
        <p className="max-w-xl rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Your login isn&apos;t linked to an employee record yet, so there is no leave to show. Ask HR to add you.
        </p>
        {awaiting.length > 0 && <Awaiting rows={awaiting} />}
      </div>
    );
  }

  const year = new Date().getFullYear();
  const [balance, mine, holidays] = await Promise.all([
    balanceFor(employee, year),
    getRequests({ employeeId: employee.id, limit: 50 }),
    loadHolidays(db, employee.centerId),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = holidays.filter((h) => h.onDate >= today).slice(0, 12);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{employee.name}</h2>
        <p className="text-sm text-muted-foreground">
          {[employee.designation, employee.department, employee.empNo].filter(Boolean).join(" · ")}
        </p>
      </section>

      {awaiting.length > 0 && <Awaiting rows={awaiting} />}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">My leave</h3>
        <BalanceCards balance={balance} />
        {balance.lopDays > 0 && <p className="text-xs text-muted-foreground">Loss of pay and half days this year: {balance.lopDays} days.</p>}
      </section>

      <ApplyLeaveForm />

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">My requests</h3>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {mine.map((r) => (
                  <tr key={r.id} className="border-t first:border-t-0">
                    <td className="p-2">
                      <Link href={`/hr/leave/${r.id}`} className="underline">
                        #{r.leaveNo}
                      </Link>
                    </td>
                    <td className="p-2">{kindText(r.kind)}</td>
                    <td className="p-2">{rangeText(r)}</td>
                    <td className="p-2">{r.days} day{r.days === 1 ? "" : "s"}</td>
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

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Company holidays</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">None coming up.</p>
        ) : (
          <ul className="text-sm">
            {upcoming.map((h) => (
              <li key={`${h.onDate}-${h.name}`}>
                {dayText(h.onDate)} — {h.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Payslips</h3>
        <p className="text-sm text-muted-foreground">Your salary slips will appear here once payroll is set up.</p>
      </section>
    </div>
  );
}

function Awaiting({ rows }: { rows: Awaited<ReturnType<typeof getRequests>> }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Waiting for your approval ({rows.length})</h3>
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
      </div>
    </section>
  );
}
