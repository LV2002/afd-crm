import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatPercent } from "@/lib/reports/ad-performance";
import { loadReportLeads, type ReportLead } from "@/lib/reports/load-report-leads";
import {
  MIN_FOR_RATE,
  overallRate,
  segmentPerformance,
  standoutSegments,
  type SegmentRow,
} from "@/lib/reports/segments";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Which places and which schools actually convert.
 *
 * The Insights pivot can group leads by district — it counts them. It
 * cannot say that Kannur sends forty and nine enrol while Kozhikode sends
 * thirty-five and two, which is the sentence that moves a school visit or
 * an ad radius.
 *
 * Small segments get their counts shown and their percentage withheld.
 * "Two out of three, 67%" is how one good year at one school becomes a
 * budget line.
 */

const DIMENSIONS = [
  { key: "district", label: "District", pick: (lead: ReportLead) => lead.district },
  { key: "state", label: "State", pick: (lead: ReportLead) => lead.state },
  { key: "city", label: "City", pick: (lead: ReportLead) => lead.city },
  { key: "school", label: "School / college", pick: (lead: ReportLead) => lead.schoolCollege },
  { key: "board", label: "Board", pick: (lead: ReportLead) => lead.board },
  { key: "education", label: "Education", pick: (lead: ReportLead) => lead.educationStatus },
  { key: "exam_year", label: "Exam year", pick: (lead: ReportLead) => lead.examYear },
] as const;

export default async function SegmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "report.read")) return <AccessDenied />;

  const params = await searchParams;
  const raw = params.by;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const dimension = DIMENSIONS.find((entry) => entry.key === requested) ?? DIMENSIONS[0];

  const leads = await loadReportLeads(user);
  const rows = segmentPerformance(
    leads.map((lead) => ({
      leadId: lead.id,
      value: dimension.pick(lead),
      admitted: lead.admitted,
    })),
  );

  const overall = overallRate(rows);
  const { best, worst } = standoutSegments(rows, overall);
  const measurable = rows.filter((row) => row.conversionRate !== null).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Segments</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Not how many leads come from each place — how many of them enrol. Pick what to group by.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Group by">
        {DIMENSIONS.map((entry) => (
          <Link
            key={entry.key}
            href={`/insights/segments?by=${entry.key}`}
            aria-current={entry.key === dimension.key ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              entry.key === dimension.key
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leads to analyse yet.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {leads.length} leads across {rows.length} {dimension.label.toLowerCase()} values.
            Overall {formatPercent(overall)} of them enrol.{" "}
            {measurable === 0
              ? `None has ${MIN_FOR_RATE} leads yet, so no rate is shown below — only counts.`
              : `${measurable} have enough leads for a rate to mean anything.`}
          </p>

          {(best.length > 0 || worst.length > 0) && (
            <section className="grid gap-6 lg:grid-cols-2">
              <Standouts
                title="Well above average"
                rows={best}
                empty="Nothing stands out above the overall rate."
              />
              <Standouts
                title="Well below average"
                rows={worst}
                empty="Nothing stands out below the overall rate."
              />
            </section>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{dimension.label}</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="w-40">Share of leads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.value}>
                    <TableCell className="font-medium">{row.value}</TableCell>
                    <TableCell className="text-right tabular">{row.leads}</TableCell>
                    <TableCell className="text-right tabular">{row.admissions}</TableCell>
                    <TableCell className="text-right tabular">
                      {row.conversionRate === null ? (
                        <span
                          className="text-muted-foreground"
                          title={`Fewer than ${MIN_FOR_RATE} leads — too few for a percentage to mean anything`}
                        >
                          —
                        </span>
                      ) : (
                        formatPercent(row.conversionRate)
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${Math.max(2, Math.round(row.intensity * 100))}%` }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            A dash in the rate column means fewer than {MIN_FOR_RATE} leads. The counts are still
            there and still true — it is the percentage that would mislead, because one admission
            out of two reads as 50% and is not.
          </p>
        </>
      )}
    </div>
  );
}

function Standouts({ title, rows, empty }: { title: string; rows: SegmentRow[]; empty: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((row) => (
            <li key={row.value} className="flex items-center justify-between gap-3">
              <span className="font-medium">{row.value}</span>
              <span className="text-muted-foreground tabular">
                {formatPercent(row.conversionRate)} of {row.leads}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
