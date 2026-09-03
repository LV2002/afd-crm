import { and, eq, inArray, isNull } from "drizzle-orm";
import { DatabaseZap } from "lucide-react";

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
import { db, isDatabaseUnreachable, isDeadlineExceeded, withDeadline } from "@/lib/db/client";
import { centers, leads, pipelineStages, profiles } from "@/lib/db/schema";
import {
  aggregateCentrePerformance,
  aggregateFunnel,
  aggregateLeadsBySource,
  aggregateScorecard,
} from "@/lib/reports/aggregate-leads";

import { FunnelChart } from "./funnel-chart";
import { LeadsBySourceChart } from "./leads-by-source-chart";

/**
 * docs/02-BUILD-PHASES.md § Phase 2: prebuilt dashboards. Runs on the
 * direct db client rather than the RLS-bound one deliberately: `leads`'
 * own RLS is gated on `lead.read`, but `report.read`/`report.center`/
 * `report.org` are meant to grant *aggregate counts* to roles that don't
 * necessarily hold `lead.read` at all (accounts, academics — see
 * docs/DECISIONS.md) without ever exposing an individual lead's PII.
 * This page only ever selects id/assignedTo/centerId/stageId/
 * firstTouchSource — never a name, phone, or email — so that boundary
 * holds regardless of which client fetches it.
 */
/**
 * Runs one query under its own deadline and logs how long it took. The
 * per-query label is the point: when this page stalled, "the page doesn't
 * load" was all anyone could see, and a single combined timeout still
 * couldn't say *which* read was slow. Each line lands in the dev server
 * log (and in Vercel's function logs), so a stall names itself.
 */
async function timedQuery<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const result = await withDeadline(run(), 8_000, `Insights "${label}" query`);
    console.log(`[insights] ${label}: ok in ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    console.error(`[insights] ${label}: FAILED after ${Date.now() - started}ms`, error);
    throw error;
  }
}

function DatabaseUnreachable() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
      <DatabaseZap className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">Can&apos;t reach the database.</p>
      <p className="max-w-prose text-xs text-muted-foreground">
        This page reads directly from Postgres rather than through Supabase&apos;s API, so it is
        the first place a bad <code className="font-mono">DATABASE_URL</code> shows up — every
        other screen can still look fine. Check that{" "}
        <code className="font-mono">DATABASE_URL</code> is set to Supabase&apos;s{" "}
        <strong>Transaction pooler</strong> connection string (port{" "}
        <code className="font-mono">6543</code>), not the direct one — locally in{" "}
        <code className="font-mono">.env.local</code>, and on Vercel in Project Settings →
        Environment Variables. The direct hostname is IPv6-only and is unreachable from Vercel
        and from many home networks. Run <code className="font-mono">npm run db:check</code> to
        test the connection directly. See docs/GETTING-STARTED.md.
      </p>
    </div>
  );
}

/**
 * Distinct from DatabaseUnreachable on purpose: here the connection *worked*
 * and a query was simply too slow, so pointing at DATABASE_URL would send
 * someone to re-check a setting that is already correct.
 */
function DatabaseTooSlow() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
      <DatabaseZap className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">The database didn&apos;t respond in time.</p>
      <p className="max-w-prose text-xs text-muted-foreground">
        The connection opened, so <code className="font-mono">DATABASE_URL</code> is reachable —
        a query just took too long to come back. The dev server log (or Vercel&apos;s function
        log) names which one, on a line beginning{" "}
        <code className="font-mono">[insights]</code>. A paused or sleeping Supabase project is
        the usual cause; the Supabase dashboard will say so and offer Restore. Run{" "}
        <code className="font-mono">npm run db:check</code> to confirm the database is awake.
      </p>
    </div>
  );
}

export default async function InsightsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "report.read")) return <AccessDenied />;

  // Three separate permission codes, not one scoped permission — the
  // widest one the caller holds decides how much they see. See
  // docs/DECISIONS.md for why this reads code presence rather than
  // scopeFor()'s per-permission scope attribute.
  const scope = can(user, "report.org") ? "all" : can(user, "report.center") ? "center" : "own";

  const leadWhere =
    scope === "all"
      ? isNull(leads.deletedAt)
      : scope === "center"
        ? and(isNull(leads.deletedAt), inArray(leads.centerId, user.centerIds))
        : and(isNull(leads.deletedAt), eq(leads.assignedTo, user.id));

  // This is the only *page* in the app that reads over a direct Postgres
  // socket (everything else goes through Supabase's HTTP API), so it is
  // also the only page that breaks when DATABASE_URL is wrong or points
  // at a host this environment can't route to. That made a config problem
  // look like a broken page. Catch it here and say so plainly; anything
  // else is a real bug and still throws. See docs/DECISIONS.md.
  // Run these one at a time rather than in a Promise.all. The db client is
  // `max: 1`, so concurrency buys nothing — four queries serialise on the
  // single connection either way — but issuing them together makes
  // postgres.js *pipeline* them, and pipelining is where connection-pooler
  // incompatibilities live (Supabase's transaction-mode pooler hands each
  // transaction a different physical connection). Sequential costs the same
  // wall-clock time here, avoids that class of stall, and names the query
  // that is slow instead of hanging the whole page anonymously.
  let leadRows, stageRows, centerRows, profileRows;
  try {
    leadRows = await timedQuery("leads", () =>
      db
        .select({
          id: leads.id,
          assignedTo: leads.assignedTo,
          centerId: leads.centerId,
          stageId: leads.stageId,
          firstTouchSource: leads.firstTouchSource,
        })
        .from(leads)
        .where(leadWhere),
    );
    stageRows = await timedQuery("stages", () =>
      db
        .select({ id: pipelineStages.id, name: pipelineStages.name, sortOrder: pipelineStages.sortOrder, stageType: pipelineStages.stageType })
        .from(pipelineStages),
    );
    centerRows = await timedQuery("centers", () =>
      db.select({ id: centers.id, name: centers.name }).from(centers),
    );
    profileRows = await timedQuery("profiles", () =>
      db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles),
    );
  } catch (error) {
    // Order matters: a deadline error also carries ETIMEDOUT, so check the
    // more specific case first or a slow query gets reported as unreachable.
    if (isDeadlineExceeded(error)) return <DatabaseTooSlow />;
    if (isDatabaseUnreachable(error)) return <DatabaseUnreachable />;
    throw error;
  }

  const centerNameById = new Map(centerRows.map((c) => [c.id, c.name]));
  const userNameById = new Map(profileRows.map((p) => [p.id, p.fullName]));

  const bySource = aggregateLeadsBySource(leadRows);
  const funnel = aggregateFunnel(leadRows, stageRows);
  const scorecard = scope !== "own" ? aggregateScorecard(leadRows, stageRows, userNameById) : [];
  const centrePerformance = scope !== "own" ? aggregateCentrePerformance(leadRows, stageRows, centerNameById) : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-sm text-muted-foreground">
          A current snapshot — {leadRows.length} lead{leadRows.length === 1 ? "" : "s"} in view.
          Not yet filterable by date range; see docs/DECISIONS.md.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Leads by source</h2>
        {bySource.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leads yet.</p>
        ) : (
          <LeadsBySourceChart data={bySource} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Funnel</h2>
        <FunnelChart data={funnel} />
      </section>

      {scope !== "own" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Counsellor scorecard</h2>
          {scorecard.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads assigned to anyone yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Counsellor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Lost</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scorecard.map((row) => (
                  <TableRow key={row.ownerId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{row.total}</TableCell>
                    <TableCell className="text-right">{row.won}</TableCell>
                    <TableCell className="text-right">{row.lost}</TableCell>
                    <TableCell className="text-right">
                      {row.total > 0 ? `${((row.won / row.total) * 100).toFixed(0)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}

      {scope !== "own" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Centre performance</h2>
          {centrePerformance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads assigned to a centre yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Centre</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Lost</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {centrePerformance.map((row) => (
                  <TableRow key={row.centerId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{row.total}</TableCell>
                    <TableCell className="text-right">{row.won}</TableCell>
                    <TableCell className="text-right">{row.lost}</TableCell>
                    <TableCell className="text-right">
                      {row.total > 0 ? `${((row.won / row.total) * 100).toFixed(0)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </div>
  );
}
