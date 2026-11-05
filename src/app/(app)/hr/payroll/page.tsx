import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { formatINR } from "@/lib/format/currency";
import { getEmployees } from "@/lib/hr/queries";
import { monthOverview } from "@/lib/payroll/service";

export const dynamic = "force-dynamic";

const STATE_LABEL = { paid: "Paid", recorded: "Recorded, not on statement", partial: "Part paid", unpaid: "Unpaid" } as const;

/** One month, everybody: what each is owed, and how much of it has actually reached them. */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.read")) return <AccessDenied />;
  const { month: q } = await searchParams;
  const month = q && /^\d{4}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 7);
  const [rows, employees] = await Promise.all([monthOverview(db, month), getEmployees()]);
  const slipFor = new Set(rows.map((r) => r.slip.employeeId));
  const missing = employees.filter((e) => e.status === "active" && !slipFor.has(e.id));

  const totalNet = rows.reduce((t, r) => t + r.slip.netPaise, 0);
  const verified = rows.reduce((t, r) => t + r.status.verifiedPaise + r.status.cashPaise, 0);
  const recorded = rows.reduce((t, r) => t + r.status.recordedPaise, 0);
  const canGenerate = can(user, "payroll.generate");
  const advances = rows.reduce((t, r) => t + r.status.advancePaise, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pm" className="text-sm font-medium">Month</label>
            <input id="pm" name="month" type="month" defaultValue={month} className="h-9 rounded-md border bg-background px-3 text-sm" />
          </div>
          <button type="submit" className="h-9 rounded-md border px-3 text-sm">Show</button>
        </form>
        {canGenerate && (
          <div className="flex gap-2">
            <Link href={`/hr/payroll/review?month=${month}`} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Review and generate the month
            </Link>
            <Link href={`/hr/payroll/generate?month=${month}`} className="rounded-md border px-4 py-2 text-sm font-medium">
              Generate one payslip
            </Link>
          </div>
        )}
      </div>

      {advances > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          {formatINR(advances)} was paid over the salary this month, as advances: {rows.filter((r) => r.status.advancePaise > 0).map((r) => `${r.name} ${formatINR(r.status.advancePaise)}`).join(", ")}.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Payslips" value={String(rows.length)} />
        <Stat label="Net pay owed" value={formatINR(totalNet)} />
        <Stat label="Paid and verified" value={formatINR(verified)} />
        <Stat label="Still to pay" value={formatINR(Math.max(0, totalNet - recorded))} bad={totalNet - recorded > 0} />
      </dl>

      {rows.length > 0 && (
        <a href={`/hr/payroll/pdf?month=${month}`} className="w-fit text-sm font-medium underline">
          Download all {rows.length} payslips for {month} as one PDF (for printing)
        </a>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Employee</th>
              <th className="p-2 text-right">Net pay</th>
              <th className="p-2">Approved</th>
              <th className="p-2 text-right">Paid</th>
              <th className="p-2">Payment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slip.id} className="border-t">
                <td className="p-2 font-medium">
                  <Link href={`/hr/payroll/${r.slip.id}`} className="underline">{r.name}</Link>
                  <span className="ml-2 text-xs text-muted-foreground">#{r.slip.slipNo}{r.slip.version > 1 ? ` v${r.slip.version}` : ""}</span>
                </td>
                <td className="p-2 text-right">{formatINR(r.slip.netPaise)}</td>
                <td className="p-2">{r.slip.approvedAt ? "Yes" : <Badge variant="outline">Not yet</Badge>}</td>
                <td className="p-2 text-right">{formatINR(r.status.recordedPaise)}</td>
                <td className="p-2">
                  <Badge variant={r.status.state === "paid" ? "default" : r.status.state === "unpaid" ? "destructive" : "secondary"}>
                    {STATE_LABEL[r.status.state]}
                  </Badge>
                  {r.status.cashPaise > 0 && <span className="ml-2 text-xs text-muted-foreground">cash {formatINR(r.status.cashPaise)}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No payslips for this month yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {missing.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">No payslip yet ({missing.length})</h3>
          <p className="text-sm text-muted-foreground">
            {missing.map((e, i) => (
              <span key={e.id}>
                {i > 0 && ", "}
                {canGenerate ? <Link className="underline" href={`/hr/payroll/generate?month=${month}&employee=${e.id}`}>{e.name}</Link> : e.name}
              </span>
            ))}
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-xl font-semibold ${bad ? "text-red-700" : ""}`}>{value}</dd>
    </div>
  );
}
