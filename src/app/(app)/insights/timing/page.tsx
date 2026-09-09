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
import { formatDateIST } from "@/lib/format/date";
import { formatPercent } from "@/lib/reports/ad-performance";
import { COHORT_DAYS, cohortCurves, decisionWindow } from "@/lib/reports/cohorts";
import { loadReportLeads } from "@/lib/reports/load-report-leads";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * How long people take to decide, by the month they arrived.
 *
 * The reason this is not simply "conversion rate by month" is that the
 * current month always loses. Leads who arrived three weeks ago have not
 * had time to convert, so a flat comparison shows a collapse every month
 * and a recovery every month, and nobody can tell a real drop from the
 * calendar.
 *
 * Blank cells are the point of the table. A cohort that has not lived
 * ninety days does not get a ninety-day number — not a zero, not an
 * estimate, a blank.
 */
export default async function TimingPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "report.read")) return <AccessDenied />;

  const leads = await loadReportLeads(user);
  const cohortLeads = leads.map((lead) => ({
    leadId: lead.id,
    arrivedOn: lead.arrivedOn,
    admittedOn: lead.admittedOn,
  }));

  const asOf = formatDateIST(new Date(), "yyyy-MM-dd");
  const rows = cohortCurves(cohortLeads, asOf);
  const windows = decisionWindow(cohortLeads);

  // The first checkpoint that already holds most of the admissions. This
  // is the number a follow-up cadence should be built around, and saying
  // it in a sentence beats leaving somebody to read it off a row.
  const bulk = windows.find((entry) => entry.share >= 0.8) ?? windows[windows.length - 1];
  const admittedCount = leads.filter((lead) => lead.admitted).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Timing</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every month&rsquo;s intake compared at the same age — everyone at fourteen days, everyone
          at thirty. This is how you tell a bad month from a young one.
        </p>
      </div>

      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leads to analyse yet.</p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">When admissions actually close</h3>
            {admittedCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing has converted yet, so there is no decision window to measure.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-5">
                  {windows.map((entry) => (
                    <div key={entry.day} className="flex flex-col gap-1 rounded-lg border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Within {entry.day} days
                      </p>
                      <p className="text-xl font-semibold tabular">{formatPercent(entry.share)}</p>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round(entry.share * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatPercent(bulk.share)} of admissions close within {bulk.day} days of the
                  first enquiry. A lead older than that is a different job from a fresh one, and
                  probably wants a different message.
                </p>
              </>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">By the month they arrived</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arrived</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    {COHORT_DAYS.map((day) => (
                      <TableHead key={day} className="text-right">
                        {day}d
                      </TableHead>
                    ))}
                    <TableHead className="text-right">So far</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.cohort}>
                      <TableCell className="font-medium">
                        {formatDateIST(`${row.cohort}-01T00:00:00+05:30`, "MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-right tabular">{row.size}</TableCell>
                      {COHORT_DAYS.map((day) => (
                        <TableCell key={day} className="text-right tabular">
                          {row.rates[day] === null ? (
                            <span className="text-muted-foreground" title="Not old enough to know">
                              —
                            </span>
                          ) : (
                            formatPercent(row.rates[day])
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular">
                        {formatPercent(row.size === 0 ? 0 : row.admitted / row.size)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              A dash means that cohort has not lived long enough for the number to exist yet — not
              that nobody converted. A month is only counted as thirty days old once its{" "}
              <em>newest</em> lead is thirty days old, so the figure is never propped up by the
              people who happened to arrive on the 1st.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
