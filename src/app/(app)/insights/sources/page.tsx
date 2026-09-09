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
import { compareTouch, describeRole, multiTouchShare } from "@/lib/reports/attribution";
import { loadReportLeads } from "@/lib/reports/load-report-leads";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Which sources start conversations, and which ones finish them.
 *
 * Both touches have been stored on every lead since the identity layer
 * shipped and neither has ever been compared to the other. The whole
 * report exists for one decision: a source that introduces people and a
 * source that closes them both look weak in the column that is not their
 * job, and budget gets cut on that misreading.
 */

const ROLE_COPY = {
  introducer: {
    label: "Brings people in",
    hint: "More admissions started here than finished here.",
    variant: "default",
  },
  closer: {
    label: "Closes people",
    hint: "More admissions finished here than started here.",
    variant: "secondary",
  },
  balanced: { label: "Both ends", hint: "Does the same job at both ends.", variant: "outline" },
} as const;

export default async function SourcesPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "report.read")) return <AccessDenied />;

  const leads = await loadReportLeads(user);
  const rows = compareTouch(
    leads.map((lead) => ({
      leadId: lead.id,
      firstTouchSource: lead.firstTouchSource,
      lastTouchSource: lead.lastTouchSource,
      admitted: lead.admitted,
    })),
  );

  const moved = multiTouchShare(
    leads.map((lead) => ({
      leadId: lead.id,
      firstTouchSource: lead.firstTouchSource,
      lastTouchSource: lead.lastTouchSource,
      admitted: lead.admitted,
    })),
  );

  const introducers = rows.filter((row) => describeRole(row) === "introducer");
  const closers = rows.filter((row) => describeRole(row) === "closer");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Sources: first touch vs last touch</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Where somebody first heard of us is rarely where they finally came from. This shows both
          for every source, so a channel that introduces people is not judged on closes it was
          never going to make.
        </p>
      </div>

      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leads to analyse yet.</p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Leads analysed"
              value={String(leads.length)}
              hint={`${leads.filter((lead) => lead.admitted).length} admitted`}
            />
            <Stat
              label="Changed source"
              value={formatPercent(moved)}
              hint="Came from somewhere different than they arrived from."
            />
            <Stat
              label="Sources in play"
              value={String(rows.length)}
              hint={`${introducers.length} introduce · ${closers.length} close`}
            />
          </section>

          {moved === 0 && (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Nobody in this range arrived from one source and converted from another, so the two
              columns below are identical. That is usually a sign that repeat enquiries are being
              entered as new leads rather than matched to the existing person — the two columns
              only ever differ when a second enquiry lands on a lead that already exists.
            </p>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Every source, both ways</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Arrived here</TableHead>
                    <TableHead className="text-right">Converted here</TableHead>
                    <TableHead className="text-right">Admissions started</TableHead>
                    <TableHead className="text-right">Admissions finished</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const role = ROLE_COPY[describeRole(row)];
                    return (
                      <TableRow key={row.source}>
                        <TableCell className="font-medium">{row.source}</TableCell>
                        <TableCell className="text-right tabular">{row.firstTouchLeads}</TableCell>
                        <TableCell className="text-right tabular">{row.lastTouchLeads}</TableCell>
                        <TableCell className="text-right tabular">
                          {row.firstTouchAdmissions}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {row.lastTouchAdmissions}
                        </TableCell>
                        <TableCell>
                          <Badge variant={role.variant}>{role.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              A lead who arrived from Instagram and converted after a walk-in counts once in
              Instagram&rsquo;s <em>started</em> column and once in Walk-in&rsquo;s{" "}
              <em>finished</em> column. The two columns will not add up to the same total, and they
              are not supposed to.
            </p>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <RoleList
              title="Cut these last"
              blurb={ROLE_COPY.introducer.hint}
              rows={introducers}
              metric={(row) => `+${row.introducerScore} admissions started`}
              empty="No source is doing noticeably more introducing than closing."
            />
            <RoleList
              title="These finish the job"
              blurb={ROLE_COPY.closer.hint}
              rows={closers}
              metric={(row) => `${-row.introducerScore} admissions finished`}
              empty="No source is doing noticeably more closing than introducing."
            />
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

function RoleList({
  title,
  blurb,
  rows,
  metric,
  empty,
}: {
  title: string;
  blurb: string;
  rows: ReturnType<typeof compareTouch>;
  metric: (row: ReturnType<typeof compareTouch>[number]) => string;
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{blurb}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((row) => (
            <li key={row.source} className="flex items-center justify-between gap-3">
              <span className="font-medium">{row.source}</span>
              <span className="text-muted-foreground">{metric(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
