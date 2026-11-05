import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { employeePay, employees, payslips } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { formatINR } from "@/lib/format/currency";
import { formatDateIST } from "@/lib/format/date";
import type { PayrollResult } from "@/lib/payroll/calc";
import { SALARY_CATEGORY, loadPayrollSettings, paymentStatuses } from "@/lib/payroll/service";
import { loadAttendanceReport } from "@/lib/attendance/load";

import { ApproveButton, LinkEntryButton, PayForm, PayFromLineButton, PrintButton } from "../payroll-forms";
import { SlipView } from "../slip-view";

export const dynamic = "force-dynamic";

const STATE = { paid: "Paid", recorded: "Recorded, not yet on the bank statement", partial: "Part paid", unpaid: "Unpaid" } as const;
const day = (iso: string) => formatDateIST(`${iso.slice(0, 10)}T12:00:00+05:30`, "d MMM yyyy");

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <AccessDenied />;
  const { id } = await params;
  const [slip] = await db.select().from(payslips).where(eq(payslips.id, id));
  if (!slip) notFound();
  const [emp] = await db.select().from(employees).where(eq(employees.id, slip.employeeId));
  if (!emp) notFound();

  const isPayroll = can(user, "payroll.read");
  const isSelf = emp.userId === user.id;
  if (!isPayroll && !isSelf) return <AccessDenied />;

  const [pay] = await db.select().from(employeePay).where(eq(employeePay.employeeId, emp.id));
  const settings = await loadPayrollSettings(db);
  // An employee sees a payslip once it is approved, and only the current one.
  if (!isPayroll && (slip.status !== "current" || (settings.requireApproval && !slip.approvedAt))) notFound();
  const status = (await paymentStatuses(db, [{ id: slip.id, netPaise: slip.netPaise }])).get(slip.id)!;
  const result = slip.result as unknown as PayrollResult;

  // What the payment side needs, for people who run payroll only.
  let accounts: Array<{ id: string; name: string; type: string }> = [];
  let entries: Array<{ id: string; label: string }> = [];
  let lines: Array<{ id: string; label: string }> = [];
  const canPay = can(user, "payroll.generate") && slip.status === "current" && (!settings.requireApproval || Boolean(slip.approvedAt));
  if (isPayroll && canPay) {
    const scope = scopeFor(user, "finance.record");
    const centreClause = scope === "all" ? sql`` : user.centerIds.length ? sql`and a.center_id in (${sql.join(user.centerIds.map((c) => sql`${c}::uuid`), sql`, `)})` : sql`and false`;
    accounts = [
      ...(await db.execute<{ id: string; name: string; type: string }>(sql`
        select a.id, a.name, a.type from finance_accounts a where a.is_active and a.deleted_at is null ${centreClause} order by a.type, a.name`)),
    ];
    entries = [
      ...(await db.execute<{ id: string; occurred_on: string; amount_paise: string; description: string }>(sql`
        select t.id, t.occurred_on::text as occurred_on, t.amount_paise, t.description
        from finance_transactions t join finance_accounts a on a.id = t.account_id
        where t.category = ${SALARY_CATEGORY} and t.direction = 'out' and t.amount_paise > 0
          and not exists (select 1 from payslip_payments sp where sp.transaction_id = t.id)
          and not exists (select 1 from finance_transactions r where r.reverses_transaction_id = t.id)
          ${centreClause}
        order by abs(t.amount_paise - ${status.remainingPaise}), t.occurred_on desc limit 8`)),
    ].map((r) => ({ id: r.id, label: `Link entry · ${day(r.occurred_on)} · ${formatINR(Number(r.amount_paise))} · ${r.description}` }));
    lines = [
      ...(await db.execute<{ id: string; occurred_on: string; amount_paise: string; particulars: string }>(sql`
        select l.id, l.occurred_on::text as occurred_on, l.amount_paise, l.particulars
        from bank_statement_lines l join finance_accounts a on a.id = l.account_id
        where l.direction = 'out'
          and not exists (select 1 from bank_matches m where m.bank_line_id = l.id and m.active)
          ${centreClause}
        order by abs(l.amount_paise - ${status.remainingPaise}), l.occurred_on desc limit 8`)),
    ].map((r) => ({ id: r.id, label: `${day(r.occurred_on)} · ${formatINR(Number(r.amount_paise))} · ${r.particulars.slice(0, 70)}` }));
  }

  // Days the biometric device saw nobody, that this payslip does not account
  // for as leave, loss of pay or a half day. Shown to payroll only, so a
  // missing deduction can be noticed by somebody other than whoever made it.
  let uncovered: string[] = [];
  if (isPayroll && slip.status === "current") {
    const report = await loadAttendanceReport(db, emp.id, slip.month);
    if (report) {
      const covered = new Set(result.leave.treated.map((t) => t.date));
      uncovered = report.days.filter((d) => d.status === "absent" && !covered.has(d.date)).map((d) => d.date);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={isPayroll ? `/hr/payroll?month=${slip.month}` : "/hr/me"} className="text-sm text-muted-foreground underline">
          Back
        </Link>
        <div className="flex items-center gap-2">
          <a href={`/hr/payroll/${slip.id}/pdf`} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            Download PDF
          </a>
          <PrintButton />
        </div>
      </div>

      {slip.status === "superseded" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 print:hidden">
          This version was replaced by a newer payslip for the same month.
        </p>
      )}

      <SlipView
        result={result}
        employee={{ ...emp, pan: isPayroll || isSelf ? (pay?.pan ?? null) : null, bankName: pay?.bankName ?? null, bankAccount: pay?.bankAccount ?? null, ifsc: pay?.ifsc ?? null }}
        company={{ name: settings.companyName, address: settings.companyAddress, contactEmail: settings.contactEmail, lateAllowance: settings.lateAllowanceMin, earlyAllowance: settings.earlyAllowanceMin }}
        paymentNote={status.payments.length ? `Paid ${formatINR(status.recordedPaise)} — ${status.payments.map((p) => `${day(p.occurredOn)} from ${p.accountName}`).join("; ")}` : null}
      />

      {uncovered.length > 0 && (
        <p className="max-w-3xl rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 print:hidden">
          The biometric device recorded no punch on {uncovered.length} working day{uncovered.length === 1 ? "" : "s"} that this payslip does not
          treat as leave or loss of pay: {uncovered.map((d) => day(d)).join(", ")}. Check whether pay should have been deducted.
        </p>
      )}

      {isPayroll && (
        <section className="flex max-w-3xl flex-col gap-3 print:hidden">
          <h3 className="text-sm font-semibold">
            Payment{" "}
            <Badge variant={status.state === "paid" ? "default" : status.state === "unpaid" ? "destructive" : "secondary"}>{STATE[status.state]}</Badge>
          </h3>

          {!slip.approvedAt ? (
            <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
              <p>
                Not yet approved.{" "}
                {settings.requireApproval ? "It can't be paid until the owner approves it." : ""}
              </p>
              {can(user, "payroll.manage") && slip.status === "current" && <ApproveButton payslipId={slip.id} />}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Approved {formatDateIST(slip.approvedAt, "d MMM yyyy, h:mm a")}.</p>
          )}

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Fig label="Net pay" value={formatINR(slip.netPaise)} />
            <Fig label="Salary recorded as paid" value={formatINR(status.recordedPaise)} />
            <Fig label="Proved by the bank statement" value={formatINR(status.verifiedPaise)} />
            <Fig label="Still owed" value={formatINR(status.remainingPaise)} bad={status.remainingPaise > 0} />
            <Fig label="Paid as an advance" value={formatINR(status.advancePaise)} />
          </dl>
          {status.advancePaise > 0 && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
              {formatINR(status.advancePaise)} was paid over the salary. It is an advance to {emp.name}: it is added to the next payslip, and is
              recovered by entering an amount under &ldquo;Advance repaid&rdquo; in the months that follow.
            </p>
          )}

          {status.payments.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {status.payments.map((p) => (
                  <tr key={p.transactionId} className="border-t">
                    <td className="p-1.5">{day(p.occurredOn)}</td>
                    <td className="p-1.5">{p.accountName}</td>
                    <td className="p-1.5">
                      {formatINR(p.amountPaise)}
                      {p.advancePaise > 0 && <span className="ml-1 text-xs text-muted-foreground">(incl. {formatINR(p.advancePaise)} advance)</span>}
                    </td>
                    <td className="p-1.5">
                      {p.accountType !== "bank" ? (
                        <span className="text-muted-foreground">Cash: no statement to check</span>
                      ) : p.onStatement ? (
                        <span className="text-green-700">✓ On the bank statement</span>
                      ) : (
                        <span className="text-red-700">Not on a statement yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {canPay && (
            <>
              {lines.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium">A line on the bank statement that is this salary: one click makes it the payment</p>
                  {lines.map((l) => (
                    <PayFromLineButton key={l.id} payslipId={slip.id} bankLineId={l.id} label={l.label} />
                  ))}
                </div>
              )}
              {entries.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium">A Salaries entry already in the books</p>
                  {entries.map((e) => (
                    <LinkEntryButton key={e.id} payslipId={slip.id} transactionId={e.id} label={e.label} />
                  ))}
                </div>
              )}
              <p className="text-xs font-medium">Or record a payment</p>
              <p className="text-xs text-muted-foreground">
                Pay more than the slip shows and the extra is recorded as an advance to this person.
              </p>
              <PayForm payslipId={slip.id} remaining={String(status.remainingPaise / 100)} accounts={accounts} />
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Fig({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-lg border p-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-semibold ${bad ? "text-red-700" : ""}`}>{value}</dd>
    </div>
  );
}
