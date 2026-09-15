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
import { formatPercent } from "@/lib/reports/ad-performance";
import { loadReportLeads } from "@/lib/reports/load-report-leads";
import { loadReferrerLabels } from "@/lib/reports/referrer-labels";
import {
  referralsByMonth,
  secondGenerationCount,
  summariseReferrals,
  topReferrers,
} from "@/lib/reports/referrals";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * How much of the institute runs on word of mouth.
 *
 * Leon's ask, near enough verbatim: the counsellor marks who referred a
 * lead, and this says how many people came that way. The number that
 * actually changes a decision is the one beside it — referred enquiries
 * convert at a different rate from cold ones, and if the gap is as large
 * here as it usually is for a coaching institute, then asking every
 * admitted student for two names is the cheapest lead source available
 * and nobody was measuring it.
 */
const MAX_REFERRERS = 25;

export default async function ReferralsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "report.read")) return <AccessDenied />;

  const leads = await loadReportLeads(user);
  const rows = leads.map((lead) => ({
    leadId: lead.id,
    referredByLeadId: lead.referredByLeadId,
    admitted: lead.admitted,
    arrivedOn: lead.arrivedOn,
  }));

  const summary = summariseReferrals(rows);
  const standings = topReferrers(rows, MAX_REFERRERS);
  const months = referralsByMonth(rows).slice(-12).reverse();
  const secondGeneration = secondGenerationCount(rows);

  const labels = await loadReferrerLabels(
    user,
    standings.map((row) => row.referrerId),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Referrals</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Everybody a counsellor marked as sent by somebody else, on the &ldquo;Referred by&rdquo;
          field on the lead. Only leads with that field filled in are counted here — a referral
          logged as a walk-in is invisible to this page, which is the one thing to fix if these
          numbers look low.
        </p>
      </div>

      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leads to analyse yet.</p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Came by referral"
              value={String(summary.referredLeads)}
              hint={`${formatPercent(summary.referredShare)} of ${summary.totalLeads} leads`}
            />
            <Stat
              label="Referred admissions"
              value={String(summary.referredAdmissions)}
              hint={`${formatPercent(summary.referredConversion)} of referred leads enrolled`}
            />
            <Stat
              label="Everybody else"
              value={formatPercent(summary.otherConversion)}
              hint={`${summary.otherAdmissions} admissions from ${
                summary.totalLeads - summary.referredLeads
              } leads`}
            />
            <Stat
              label="People sending them"
              value={String(summary.referrerCount)}
              hint={
                secondGeneration > 0
                  ? `${secondGeneration} referred by somebody who was referred`
                  : "Nobody referred has yet referred anybody."
              }
            />
          </section>

          {summary.referredLeads === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Nothing marked as a referral yet. The field is on every lead — open one, go to{" "}
              <strong>Tracking</strong>, and search for the person who sent them under{" "}
              <strong>Referred by</strong>. It only takes counting once for word of mouth to stop
              being a guess.
            </p>
          ) : (
            <p className="rounded-md border p-4 text-sm">
              A referred enquiry enrols{" "}
              <strong>
                {summary.conversionLiftPoints > 0
                  ? `${summary.conversionLiftPoints} points more often`
                  : summary.conversionLiftPoints < 0
                    ? `${Math.abs(summary.conversionLiftPoints)} points less often`
                    : "about as often"}
              </strong>{" "}
              than everybody else ({formatPercent(summary.referredConversion)} against{" "}
              {formatPercent(summary.otherConversion)}).{" "}
              <span className="text-muted-foreground">
                {summary.referredLeads < 20
                  ? "On this few referrals that gap is not yet worth acting on — check again once there are a few dozen."
                  : "Worth knowing before the next month of ad budget is set."}
              </span>
            </p>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Who is sending people</h3>
            {standings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referrer</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Enrolled</TableHead>
                      <TableHead className="text-right">Conversion</TableHead>
                      <TableHead>Last one</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {standings.map((row) => {
                      const label = labels.get(row.referrerId);
                      return (
                        <TableRow key={row.referrerId}>
                          <TableCell className="font-medium">
                            {label?.named ? (
                              <Link href={`/leads/${row.referrerId}`} className="hover:underline">
                                {label.label}
                              </Link>
                            ) : (
                              (label?.label ?? "Unknown")
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular">{row.referrals}</TableCell>
                          <TableCell className="text-right tabular">{row.admissions}</TableCell>
                          <TableCell className="text-right tabular">
                            {row.admissions > 0 ? (
                              <Badge variant="secondary">{formatPercent(row.conversion)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.lastReferralOn}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              A name appears where you could open that lead anyway; everybody else&rsquo;s referrer
              shows as a lead number. Phone numbers are never listed here.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Month by month</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">By referral</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Referred admissions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {months.map((month) => (
                    <TableRow key={month.month}>
                      <TableCell className="font-medium">{month.month}</TableCell>
                      <TableCell className="text-right tabular">{month.leads}</TableCell>
                      <TableCell className="text-right tabular">{month.referred}</TableCell>
                      <TableCell className="text-right tabular">
                        {formatPercent(month.referredShare)}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {month.referredAdmissions}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
