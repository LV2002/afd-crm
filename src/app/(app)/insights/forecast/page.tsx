import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatINR } from "@/lib/format/currency";
import { formatDateIST } from "@/lib/format/date";
import { formatPercent } from "@/lib/reports/ad-performance";
import { monthEndCeiling, pace, type Pace, type PaceVerdict } from "@/lib/reports/forecast";
import { loadForecast, type ForecastRow, type TargetMetric } from "@/lib/reports/load-forecast";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Is the month on course?
 *
 * Two claims, kept apart on purpose (see lib/reports/forecast.ts). Pace is
 * arithmetic on what has already happened. The weighted pipeline is a
 * claim about specific people still in play. When they disagree — a good
 * pace on an empty pipeline — the disagreement is the finding, and seeing
 * it on the 14th is the entire reason to look.
 */

const VERDICT: Record<
  PaceVerdict,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ahead: { label: "Ahead", variant: "default" },
  on_track: { label: "On track", variant: "secondary" },
  behind: { label: "Behind", variant: "destructive" },
  no_target: { label: "No target set", variant: "outline" },
};

const METRICS: Array<{ key: TargetMetric; label: string; money?: boolean }> = [
  { key: "admissions", label: "Admissions" },
  { key: "leads", label: "New leads" },
  { key: "revenue", label: "Collected", money: true },
];

function show(value: number, money: boolean | undefined): string {
  return money ? formatINR(Math.round(value)) : String(Math.round(value));
}

export default async function ForecastPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "report.read")) return <AccessDenied />;

  const now = new Date();
  const data = await loadForecast(user, now);
  const canManage = can(user, "target.manage");

  // The headline is whichever row is closest to the person reading it:
  // their own if that is all they see, their centre otherwise, the
  // institute if they run it.
  const headlineRow = data.rows[0] ?? null;
  const headline = headlineRow
    ? pace({
        achieved: headlineRow.achieved.admissions,
        target: headlineRow.targets.admissions,
        dayOfMonth: data.dayOfMonth,
        daysInMonth: data.daysInMonth,
      })
    : null;

  const anyTarget = data.rows.some((row) =>
    METRICS.some((metric) => row.targets[metric.key] !== null),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {formatDateIST(`${data.periodMonth}T00:00:00+05:30`, "MMMM yyyy")} — day{" "}
            {data.dayOfMonth} of {data.daysInMonth}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            What has happened so far this month, against what was asked for, and what the leads
            still open are worth.
          </p>
        </div>
        {canManage && (
          <Link
            href="/settings/targets"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Set targets
          </Link>
        )}
      </div>

      {!anyTarget && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No targets set for this month.</p>
          <p>
            Everything below still counts what happened — it just has nothing to compare it to.{" "}
            {canManage ? (
              <>
                <Link href="/settings/targets" className="underline">
                  Set this month&rsquo;s numbers
                </Link>{" "}
                and the same screen starts saying whether you are on course.
              </>
            ) : (
              "Somebody with permission to set targets can add them in Settings."
            )}
          </p>
        </div>
      )}

      {headline && headlineRow && (
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {headlineRow.label} · admissions
              </p>
              <p className="text-3xl font-semibold tabular">
                {headline.achieved}
                {headline.target !== null && (
                  <span className="text-lg font-normal text-muted-foreground">
                    {" "}
                    of {headline.target}
                  </span>
                )}
              </p>
            </div>
            <Badge variant={VERDICT[headline.verdict].variant}>
              {VERDICT[headline.verdict].label}
            </Badge>
          </div>

          {headline.target !== null && (
            <>
              <Progress achieved={headline.achieved} target={headline.target} />
              <p className="text-sm text-muted-foreground">
                A steady month would be at {Math.round(headline.expectedByNow ?? 0)} by now. At this
                rate the month ends at <strong>{headline.projected}</strong>.
                {headline.isEarly &&
                  " It is early in the month, so that projection is one good week multiplied — read the pipeline below instead."}
              </p>
            </>
          )}

          <p className="text-sm text-muted-foreground">
            {data.pipeline.openLeads} leads are still open and worth{" "}
            <strong>{data.pipeline.expectedAdmissions.toFixed(1)} admissions</strong> at their
            stages&rsquo; own probabilities. Everything currently in play, if it all landed this
            month, would end at {monthEndCeiling(headline.achieved, data.pipeline).toFixed(1)} —
            that is a ceiling, not a forecast: most pipelines do not close inside one month.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">This month, by scope</h3>
        {data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to show for this month yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Who</TableHead>
                  {METRICS.map((metric) => (
                    <TableHead key={metric.key} className="text-right">
                      {metric.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">On course for</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <ScopeRow
                    key={row.key}
                    row={row}
                    dayOfMonth={data.dayOfMonth}
                    daysInMonth={data.daysInMonth}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          The rows do not add up, and are not meant to: an admission at Kochi counts in
          Kochi&rsquo;s row, in the counsellor&rsquo;s row and in the institute&rsquo;s. Each is a
          separate statement about the same month.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">What the open pipeline is worth</h3>
        {data.pipeline.byStage.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing open.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Chance</TableHead>
                  <TableHead className="text-right">Worth</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pipeline.byStage.map((stage) => (
                  <TableRow key={stage.stageId ?? stage.stageName}>
                    <TableCell className="font-medium">{stage.stageName}</TableCell>
                    <TableCell className="text-right tabular">{stage.leads}</TableCell>
                    <TableCell className="text-right tabular">
                      {stage.probability === null ? (
                        <span className="text-muted-foreground">not set</span>
                      ) : (
                        formatPercent(stage.probability)
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {stage.probability === null ? "—" : stage.expected.toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {data.hasUnweightedStages && (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {data.pipeline.unweightedLeads} open lead
            {data.pipeline.unweightedLeads === 1 ? " sits" : "s sit"} in stages with no chance-of-
            closing set, so they count as nothing above and the pipeline figure is lower than the
            truth.{" "}
            {can(user, "settings.manage") ? (
              <Link href="/settings/pipeline-stages" className="underline">
                Set a probability on each stage
              </Link>
            ) : (
              "An administrator can set a probability on each stage in Settings."
            )}
            .
          </p>
        )}
      </section>
    </div>
  );
}

function Progress({ achieved, target }: { achieved: number; target: number }) {
  const share = Math.min(1, target === 0 ? 0 : achieved / target);
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.round(share * 100)}%` }}
      />
    </div>
  );
}

function ScopeRow({
  row,
  dayOfMonth,
  daysInMonth,
}: {
  row: ForecastRow;
  dayOfMonth: number;
  daysInMonth: number;
}) {
  const paces = new Map<TargetMetric, Pace>(
    METRICS.map((metric) => [
      metric.key,
      pace({
        achieved: row.achieved[metric.key],
        target: row.targets[metric.key],
        dayOfMonth,
        daysInMonth,
      }),
    ]),
  );

  // Admissions is the headline metric everywhere in this system, so the
  // row's verdict follows it — unless nobody set one, in which case
  // whichever target does exist is the one being judged on.
  const judged =
    row.targets.admissions !== null
      ? paces.get("admissions")!
      : (METRICS.map((metric) => paces.get(metric.key)!).find((entry) => entry.target !== null) ??
        paces.get("admissions")!);

  return (
    <TableRow>
      <TableCell className="font-medium">
        {row.label}
        {row.kind !== "org" && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {row.kind === "center" ? "centre" : "person"}
          </span>
        )}
      </TableCell>
      {METRICS.map((metric) => (
        <TableCell key={metric.key} className="text-right tabular">
          {show(row.achieved[metric.key], metric.money)}
          {row.targets[metric.key] !== null && (
            <span className="text-muted-foreground">
              {" "}
              / {show(row.targets[metric.key]!, metric.money)}
            </span>
          )}
        </TableCell>
      ))}
      <TableCell className="text-right tabular">
        {judged.target === null ? "—" : judged.projected}
      </TableCell>
      <TableCell>
        <Badge variant={VERDICT[judged.verdict].variant}>{VERDICT[judged.verdict].label}</Badge>
      </TableCell>
    </TableRow>
  );
}
