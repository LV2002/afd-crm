import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateIST } from "@/lib/format/date";
import { formatINR } from "@/lib/format/currency";
import { getCollections } from "@/lib/finance/reports";
import { createClient } from "@/lib/supabase/server";

/**
 * What is owed, by whom, how late — and how reliably people pay.
 *
 * The workbook's Collections and Payment Timeliness tabs together, plus
 * ageing buckets it did not have: a list sorted by due date tells you what
 * is late, but not whether the problem is getting worse.
 *
 * Nothing here is stored. Agreed instalments on one side, the append-only
 * payments ledger on the other, matched oldest-first at read time — so a
 * reversed payment puts its instalment straight back into this list with
 * no cleanup step to forget.
 */
export default async function CollectionsPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const report = await getCollections(supabase, { asOf: today });

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-4">
        <Stat label="Not yet due" value={formatINR(report.byBucket.current)} />
        <Stat label="1–30 days late" value={formatINR(report.byBucket["1-30"])} />
        <Stat label="31–60 days late" value={formatINR(report.byBucket["31-60"])} />
        <Stat label="Over 60 days" value={formatINR(report.byBucket["60+"])} alarming />
      </section>

      <section className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-lg border p-4 text-sm">
        <span>
          <span className="text-muted-foreground">Total outstanding </span>
          <span className="text-lg font-semibold">{formatINR(report.totalOutstandingPaise)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Overdue </span>
          <span className="text-lg font-semibold text-destructive">
            {formatINR(report.overduePaise)}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Paid on time </span>
          <span className="font-semibold">
            {report.timeliness.onTimeRate === null
              ? "—"
              : `${Math.round(report.timeliness.onTimeRate * 100)}%`}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Average delay (late only) </span>
          <span className="font-semibold">
            {report.timeliness.averageDaysLate === null
              ? "—"
              : `${report.timeliness.averageDaysLate.toFixed(1)} days`}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Worst delay </span>
          <span className="font-semibold">
            {report.timeliness.worstDaysLate === null
              ? "—"
              : `${report.timeliness.worstDaysLate} days`}
          </span>
        </span>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Outstanding, by due date
        </h2>
        {report.rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing outstanding — every scheduled payment is settled.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Instalment</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Days late</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.instalmentId}>
                    <TableCell>
                      {formatDateIST(`${row.dueDate}T00:00:00Z`, "d MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/accounts/${row.enrolmentId}`}
                        className="font-medium hover:underline"
                      >
                        {row.studentName}
                      </Link>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.course}</TableCell>
                    <TableCell className="text-muted-foreground">#{row.sequence}</TableCell>
                    <TableCell className="text-right">{formatINR(row.amountPaise)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.paidPaise === 0 ? "—" : formatINR(row.paidPaise)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatINR(row.outstandingPaise)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.daysOverdue > 0 ? row.daysOverdue : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Settled payments — worst delays first
        </h2>
        {report.settled.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing settled yet — this fills in as payments come in.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead className="text-right">Days late</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.settled.slice(0, 50).map((row, i) => (
                <TableRow key={`${row.studentName}-${row.dueDate}-${i}`}>
                  <TableCell>{row.studentName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.course}</TableCell>
                  <TableCell>{formatDateIST(`${row.dueDate}T00:00:00Z`, "d MMM yyyy")}</TableCell>
                  <TableCell>{formatDateIST(`${row.settledOn}T00:00:00Z`, "d MMM yyyy")}</TableCell>
                  <TableCell
                    className={
                      row.daysLate > 30
                        ? "text-right font-semibold text-destructive"
                        : "text-right"
                    }
                  >
                    {row.daysLate === 0 ? "on time" : row.daysLate}
                  </TableCell>
                  <TableCell className="text-right">{formatINR(row.amountPaise)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: "paid" | "overdue" | "due_soon" | "upcoming" }) {
  if (status === "overdue") {
    return (
      <Badge variant="outline" className="ml-2 border-destructive text-destructive">
        Overdue
      </Badge>
    );
  }
  if (status === "due_soon") {
    return (
      <Badge variant="outline" className="ml-2">
        Due soon
      </Badge>
    );
  }
  return null;
}

function Stat({
  label,
  value,
  alarming,
}: {
  label: string;
  value: string;
  alarming?: boolean;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          alarming ? "mt-1 text-xl font-semibold text-destructive" : "mt-1 text-xl font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}
