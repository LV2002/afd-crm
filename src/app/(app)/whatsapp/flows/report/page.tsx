import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { automationReport } from "@/lib/whatsapp/automation-report";
import { formatTotal } from "@/lib/whatsapp/pricing";
import { cn } from "@/lib/utils";

import { AutomationChart } from "./automation-chart";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90, 180] as const;

export default async function AutomationReportPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;
  const asked = Number((await searchParams).days);
  const days = (RANGES as readonly number[]).includes(asked) ? asked : 30;
  const report = await automationReport(days);
  const t = report.totals;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          How many messages your automations sent, and what WhatsApp charged for them. Messages are counted the moment
          they go out; the cost arrives with Meta&apos;s delivery reports, a little later.
        </p>
        <Link href="/whatsapp/flows" className="text-sm font-medium underline">
          Back to automations
        </Link>
      </div>

      <div className="flex flex-wrap gap-1 text-sm">
        {RANGES.map((range) => (
          <Link
            key={range}
            href={`/whatsapp/flows/report?days=${range}`}
            className={cn("rounded-md px-3 py-1.5", range === days ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50")}
          >
            Last {range} days
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Messages sent", t.sent.toLocaleString("en-IN")],
          ["Delivered", t.delivered.toLocaleString("en-IN")],
          ["Read", t.read.toLocaleString("en-IN")],
          ["Not delivered", t.failed.toLocaleString("en-IN")],
          ["Cost so far", formatTotal(t.cost)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <AutomationChart points={report.days.map((d) => ({ date: d.date, sent: d.sent, rupees: d.cost / 10_000 }))} />

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">By automation</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Automation</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Delivered</TableHead>
              <TableHead>Read</TableHead>
              <TableHead>Not delivered</TableHead>
              <TableHead>Billed messages</TableHead>
              <TableHead>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No automations yet.
                </TableCell>
              </TableRow>
            )}
            {report.rows.map((row) => (
              <TableRow key={row.flowId}>
                <TableCell className="font-medium">
                  <Link href={`/whatsapp/flows/${row.flowId}`} className="underline-offset-2 hover:underline">
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell>{row.sent.toLocaleString("en-IN")}</TableCell>
                <TableCell>{row.delivered.toLocaleString("en-IN")}</TableCell>
                <TableCell>{row.read.toLocaleString("en-IN")}</TableCell>
                <TableCell className={row.failed > 0 ? "text-destructive" : undefined}>{row.failed.toLocaleString("en-IN")}</TableCell>
                <TableCell>{row.billable.toLocaleString("en-IN")}</TableCell>
                <TableCell>{formatTotal(row.cost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          &ldquo;Billed messages&rdquo; and the cost come from Meta&apos;s delivery reports and cover only messages sent
          after those reports began being recorded. Replies sent inside an open 24-hour window and failed messages are
          not billed.
        </p>
      </section>
    </div>
  );
}
