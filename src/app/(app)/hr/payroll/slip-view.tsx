import { formatINR } from "@/lib/format/currency";
import { ordinal } from "@/lib/hr/leave";
import type { PayrollResult } from "@/lib/payroll/calc";

const monthName = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const dates = (list: string[]) => list.map((d) => ordinal(Number(d.slice(8, 10)))).join(", ") || "—";

/** The payslip, laid out as the original slips were. Print-friendly: "Print / save as PDF" in the browser. */
export function SlipView({
  result,
  employee,
  company,
  paymentNote,
}: {
  result: PayrollResult;
  employee: { empNo: string; name: string; designation: string | null; department: string | null; dateOfJoining: string | null; address: string | null; pan: string | null; bankName: string | null; bankAccount: string | null; ifsc: string | null };
  company: { name: string; address: string; contactEmail: string; lateAllowance: number; earlyAllowance: number };
  paymentNote?: string | null;
}) {
  const r = result;
  const c = r.components;
  const row = (label: string, value: number, show = true) =>
    show ? (
      <tr key={label}>
        <td className="py-0.5">{label}</td>
        <td className="py-0.5 text-right">{formatINR(value)}</td>
      </tr>
    ) : null;
  const leaveDates = (types: string[]) => r.leave.treated.filter((t) => types.includes(t.treatedAs)).map((t) => t.date);

  return (
    <article className="max-w-3xl overflow-hidden rounded-lg border bg-card text-sm print:border-0">
      <header className="bg-[#1f2a44] px-5 py-3 text-white">
        <h2 className="text-lg font-semibold">{company.name}</h2>
        <p className="text-xs opacity-80">{company.address}</p>
      </header>
      <div className="bg-[#f2c200] px-5 py-1.5 font-semibold text-[#1f2a44]">Payslip - {monthName(r.month)}</div>

      <div className="grid gap-x-8 gap-y-1 p-5 sm:grid-cols-2">
        <p><span className="text-muted-foreground">Employee No.</span> <b>{employee.empNo}</b></p>
        <p><span className="text-muted-foreground">Date of joining</span> <b>{employee.dateOfJoining ?? "—"}</b></p>
        <p><span className="text-muted-foreground">Name</span> <b>{employee.name}</b></p>
        <p><span className="text-muted-foreground">PAN</span> <b>{employee.pan ?? "—"}</b></p>
        <p><span className="text-muted-foreground">Designation</span> <b>{r.designation ?? employee.designation ?? "—"}</b></p>
        <p><span className="text-muted-foreground">Bank</span> <b>{employee.bankName ?? "—"}</b></p>
        <p><span className="text-muted-foreground">Department</span> <b>{employee.department ?? "—"}</b></p>
        <p>
          <span className="text-muted-foreground">Account</span>{" "}
          <b>
            {employee.bankAccount ? `${employee.bankAccount}${employee.ifsc ? `, IFSC ${employee.ifsc}` : ""}` : "—"}
          </b>
        </p>
        {employee.address && <p className="sm:col-span-2"><span className="text-muted-foreground">Address</span> {employee.address}</p>}
      </div>

      <div className="grid gap-6 border-t p-5 sm:grid-cols-2">
        <section>
          <h3 className="mb-1 font-semibold">Earnings{r.breakupNote ? <span className="font-normal text-muted-foreground"> ({r.breakupNote})</span> : null}</h3>
          <table className="w-full">
            <tbody>
              {row("Basic", c.basic)}
              {row("HRA", c.hra)}
              {row("Other allowance", c.other)}
              {row("Medical", c.medical)}
              {row("Overtime", r.lines.overtime, r.lines.overtime > 0)}
              {row("Arrears", r.lines.arrears, r.lines.arrears > 0)}
              {row("Incentives", r.lines.incentives, r.lines.incentives > 0)}
              {row("Annual bonus", r.lines.bonus, r.lines.bonus > 0)}
              <tr className="border-t font-semibold">
                <td className="py-1">Total earnings</td>
                <td className="py-1 text-right">{formatINR(r.earnings)}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">Deductions</h3>
          <table className="w-full">
            <tbody>
              {row("Insurance premium", r.lines.insurance, r.lines.insurance > 0)}
              {row("Advance repaid", r.lines.advanceRepaid, r.lines.advanceRepaid > 0)}
              {row(`Late coming (${r.late.days.toFixed(4)} days)`, r.lines.late, r.lines.late > 0)}
              {row(`Early exit (${r.early.days.toFixed(4)} days)`, r.lines.early, r.lines.early > 0)}
              {row(`Loss of pay (${r.leave.lopDays} days)`, r.lines.lop, r.lines.lop > 0)}
              {r.deductions === 0 && (
                <tr>
                  <td className="py-0.5 text-muted-foreground">None</td>
                  <td />
                </tr>
              )}
              <tr className="border-t font-semibold">
                <td className="py-1">Total deductions</td>
                <td className="py-1 text-right">{formatINR(r.deductions)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <div className="flex items-center justify-between bg-[#d9f4f4] px-5 py-3 text-base font-semibold">
        <span>Net pay</span>
        <span>{formatINR(r.net)}</span>
      </div>
      {paymentNote && <p className="border-t px-5 py-2 text-xs text-muted-foreground">{paymentNote}</p>}

      <div className="grid gap-6 border-t p-5 sm:grid-cols-2">
        <section>
          <h3 className="mb-1 font-semibold">Leave and advance</h3>
          <table className="w-full">
            <tbody>
              <tr><td className="py-0.5">Sick leave balance</td><td className="py-0.5 text-right">{r.leave.slClosing}</td></tr>
              <tr><td className="py-0.5">Casual leave balance</td><td className="py-0.5 text-right">{r.leave.clClosing}</td></tr>
              {(r.advance.broughtForward > 0 || r.advance.given > 0 || r.advance.closing > 0) && (
                <>
                  <tr><td className="py-0.5">Advance brought forward</td><td className="py-0.5 text-right">{formatINR(r.advance.broughtForward)}</td></tr>
                  <tr><td className="py-0.5">Advance given</td><td className="py-0.5 text-right">{formatINR(r.advance.given)}</td></tr>
                  <tr><td className="py-0.5">Advance repaid</td><td className="py-0.5 text-right">{formatINR(r.advance.repaid)}</td></tr>
                  <tr className="font-semibold"><td className="py-0.5">Advance outstanding</td><td className="py-0.5 text-right">{formatINR(r.advance.closing)}</td></tr>
                </>
              )}
            </tbody>
          </table>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">Attendance</h3>
          <table className="w-full">
            <tbody>
              <tr><td className="py-0.5">Sick / casual leave</td><td className="py-0.5">{dates(leaveDates(["paid_sick", "paid_casual"]))}</td></tr>
              <tr><td className="py-0.5">Loss of pay</td><td className="py-0.5">{dates(leaveDates(["lop"]))}</td></tr>
              <tr><td className="py-0.5">Half days</td><td className="py-0.5">{dates(leaveDates(["half_day"]))}</td></tr>
              <tr><td className="py-0.5">Miss punch</td><td className="py-0.5">{dates(r.leave.miss)}</td></tr>
              <tr><td className="py-0.5">Early exits ({company.earlyAllowance}m free)</td><td className="py-0.5">{dates(r.early.dates)}</td></tr>
              <tr><td className="py-0.5">Late coming ({company.lateAllowance}m free)</td><td className="py-0.5">{dates(r.late.dates)}</td></tr>
              {r.early.totalMinutes > 0 && (
                <tr><td className="py-0.5 text-muted-foreground">Early exit: total / above free</td><td className="py-0.5">{r.early.totalMinutes} / {r.early.excessMinutes} min</td></tr>
              )}
              {r.late.totalMinutes > 0 && (
                <tr><td className="py-0.5 text-muted-foreground">Late coming: total / above free</td><td className="py-0.5">{r.late.totalMinutes} / {r.late.excessMinutes} min</td></tr>
              )}
            </tbody>
          </table>
          {r.leave.treated.some((t) => t.treatedAs === "lop" && t.type !== "lop") && (
            <ul className="mt-2 text-xs text-muted-foreground">
              {r.leave.treated.filter((t) => t.treatedAs === "lop" && t.type !== "lop").map((t) => (
                <li key={t.date}>{ordinal(Number(t.date.slice(8, 10)))}: {t.reason}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="border-t px-5 py-3 text-xs text-muted-foreground">
        <p>For any clarifications email to: {company.contactEmail}</p>
        <p>This is a computer generated payslip and doesn&apos;t need a signature</p>
      </footer>
    </article>
  );
}
