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
import { formatDateIST } from "@/lib/format/date";
import {
  describeLag,
  groupGates,
  summariseGates,
  waitBand,
  type GateRow,
  type LagStats,
} from "@/lib/reports/gate-lag";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The two handover gates, and how long people spend between them.
 *
 * CLAUDE.md names both gates and calls the lag between them "a real
 * operational metric". It has been timestamped on every enrolment since
 * the finance module shipped and measured nowhere until now.
 *
 * Read through the caller's RLS-bound client, so a centre head sees their
 * own centres and no further. That is the right call HERE and the wrong
 * one on the ad performance page — spend cannot honestly be split by
 * centre, but an admission belongs to exactly one.
 *
 * The waiting list comes first on the page, above the statistics,
 * deliberately. "Nine admissions confirmed and unpaid, the oldest 34 days
 * old" is work; "median 4 days" is trivia by comparison.
 */

interface EnrolmentRow {
  id: string;
  lead_id: string;
  course: string;
  sales_to_accounts_at: string | null;
  accounts_to_academics_at: string | null;
  dropped_at: string | null;
  centers: { name: string } | null;
  leads: {
    student_name: string;
    created_at: string;
    profiles: { full_name: string } | null;
  } | null;
}

function StatCard({ label, stats, hint }: { label: string; stats: LagStats | null; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{describeLag(stats)}</p>
      <p className="text-xs text-muted-foreground">
        {stats
          ? `${stats.count} admissions · average ${stats.meanDays} · slowest ${stats.maxDays}`
          : hint}
      </p>
    </div>
  );
}

export default async function HandoversPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "report.read")) return <AccessDenied />;

  const supabase = await createClient();

  const { data: enrolments } = await supabase
    .from("enrolments")
    .select(
      "id, lead_id, course, sales_to_accounts_at, accounts_to_academics_at, dropped_at, centers(name), leads(student_name, created_at, profiles(full_name))",
    )
    .is("deleted_at", null)
    .not("sales_to_accounts_at", "is", null)
    .returns<EnrolmentRow[]>();

  const enrolmentRows = enrolments ?? [];

  // The clock starts at the first enquiry, not at the lead row's own
  // created_at: an imported lead carries its real enquiry date, and
  // measuring from the import would say every migrated admission was
  // confirmed the same week.
  const leadIds = [...new Set(enrolmentRows.map((row) => row.lead_id))];
  const { data: enquiries } = leadIds.length
    ? await supabase
        .from("enquiries")
        .select("lead_id, created_at")
        .in("lead_id", leadIds)
        .returns<Array<{ lead_id: string; created_at: string }>>()
    : { data: [] };

  const firstEnquiry = new Map<string, string>();
  for (const enquiry of enquiries ?? []) {
    const existing = firstEnquiry.get(enquiry.lead_id);
    if (!existing || enquiry.created_at < existing)
      firstEnquiry.set(enquiry.lead_id, enquiry.created_at);
  }

  const rows: GateRow[] = enrolmentRows.map((row) => ({
    enrolmentId: row.id,
    centerName: row.centers?.name ?? null,
    course: row.course,
    counsellorName: row.leads?.profiles?.full_name ?? null,
    studentName: row.leads?.student_name ?? "—",
    enquiredAt: firstEnquiry.get(row.lead_id) ?? row.leads?.created_at ?? null,
    salesToAccountsAt: row.sales_to_accounts_at,
    accountsToAcademicsAt: row.accounts_to_academics_at,
    droppedAt: row.dropped_at,
  }));

  const asOf = new Date().toISOString();
  const summary = summariseGates(rows, asOf);
  const byCentre = groupGates(rows, asOf, (row) => row.centerName);
  const byCounsellor = groupGates(rows, asOf, (row) => row.counsellorName);

  const bandVariant = { fresh: "secondary", slipping: "default", stale: "destructive" } as const;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Handovers</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every admission crosses two gates: the counsellor confirms it, then the first payment
          clears and a student record is created. This is how long that takes — and, first, who is
          stuck between the two right now.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">
          Confirmed but not paid
          {summary.stuck.length > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">
              {summary.stuck.length} waiting, the oldest {summary.stuck[0].waitingDays} days
            </span>
          )}
        </h3>

        {summary.stuck.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody. Every confirmed admission has paid.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Counsellor</TableHead>
                <TableHead>Confirmed</TableHead>
                <TableHead>Waiting</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.stuck.map((row) => (
                <TableRow key={row.enrolmentId}>
                  <TableCell className="font-medium">
                    <Link href={`/accounts/${row.enrolmentId}`} className="underline">
                      {row.studentName}
                    </Link>
                  </TableCell>
                  <TableCell>{row.course}</TableCell>
                  <TableCell>{row.centerName ?? "—"}</TableCell>
                  <TableCell>{row.counsellorName ?? "Unassigned"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateIST(row.salesToAccountsAt, "d MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={bandVariant[waitBand(row.waitingDays)]}>
                      {row.waitingDays} day{row.waitingDays === 1 ? "" : "s"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {summary.droppedBeforePaying > 0 && (
          <p className="text-xs text-muted-foreground">
            {summary.droppedBeforePaying} confirmed admission
            {summary.droppedBeforePaying === 1 ? " was" : "s were"} dropped before ever paying. Not
            listed above — somebody who left is not somebody to ring about a payment.
          </p>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Enquiry → confirmed"
          stats={summary.enquiryToConfirmed}
          hint="How long sales takes."
        />
        <StatCard
          label="Confirmed → paid"
          stats={summary.confirmedToPaid}
          hint="The gate lag proper."
        />
        <StatCard
          label="Enquiry → student"
          stats={summary.enquiryToPaid}
          hint="The whole journey."
        />
      </section>

      <p className="text-xs text-muted-foreground">
        Every figure is the <strong>median</strong>. One admission confirmed in March and paid in
        November drags an average into uselessness — the average is shown beside it, and the gap
        between the two is itself worth reading.
      </p>

      <section className="grid gap-6 lg:grid-cols-2">
        {[
          { title: "By centre", rows: byCentre },
          { title: "By counsellor", rows: byCounsellor },
        ].map((group) => (
          <div key={group.title} className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{group.title}</h3>
            {group.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to show yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{group.title === "By centre" ? "Centre" : "Counsellor"}</TableHead>
                    <TableHead>Confirmed → paid</TableHead>
                    <TableHead>Admissions</TableHead>
                    <TableHead>Waiting</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.key}</TableCell>
                      <TableCell>{describeLag(row.confirmedToPaid)}</TableCell>
                      <TableCell>{row.confirmedToPaid?.count ?? 0}</TableCell>
                      <TableCell>{row.stuck}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
