import { and, eq, getTableColumns, gte, inArray, isNull, lte } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
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
import { fieldColumn } from "@/lib/fields/field-column";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { OPTION_BEARING_TYPES, resolveFieldOptions, type FieldOption } from "@/lib/fields/resolve-field-options";
import { readFilterValues } from "@/lib/leads/apply-filters";
import { createClient } from "@/lib/supabase/server";
import { aggregateFunnel } from "@/lib/reports/aggregate-leads";
import {
  applyPivotFilters,
  dimensionFields,
  groupLeads,
  oversubscribed,
  summarise,
  type PivotField,
  type PivotLead,
} from "@/lib/reports/pivot";

import { BreakdownChart } from "./breakdown-chart";
import { FunnelChart } from "./funnel-chart";
import { InsightControls, type DimensionControl } from "./insight-controls";

/**
 * docs/02-BUILD-PHASES.md § Phase 2 asked for a "generic pivot widget";
 * this is that, replacing the four fixed reports that stood in for it.
 * Every lead variable is a filter and every lead variable is a possible
 * breakdown, so "leads by source" is one setting of the same screen that
 * answers "which exams do Kannur's walk-ins want" — a question nobody
 * would have got a report written for.
 *
 * Runs on the direct db client rather than the RLS-bound one deliberately:
 * `leads`' own RLS is gated on `lead.read`, but `report.read`/
 * `report.center`/`report.org` are meant to grant *aggregate counts* to
 * roles that don't necessarily hold `lead.read` at all (accounts,
 * academics — see docs/DECISIONS.md) without ever exposing an individual
 * lead's PII.
 *
 * That last guarantee used to hold because the page selected five fixed
 * columns. It now selects whatever the admin has configured, so the
 * guarantee moved into lib/reports/pivot.ts: only *dimension* fields are
 * ever selected — never a phone, email, file, free-text note, or the
 * name of a person — and only counts per group are ever rendered. There
 * is no row-level output on this page at all.
 */
export const maxDuration = 30;

const QUERY_TIMEOUT_MS = 10_000;
const QUERY_ATTEMPTS = 2;

/** The one variable that isn't a field_definitions row but is the one everybody wants to trend on. */
const CREATED_AT_DIMENSION: PivotField = {
  key: "created_at",
  label: "Created (month)",
  type: "datetime",
  isCore: true,
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Runs one query under its own deadline, retrying once, and logs how long
 * it took. Two things are load-bearing here.
 *
 * The per-query label: when this page stalled, "the page doesn't load" was
 * all anyone could see, and a single combined timeout still couldn't say
 * *which* read was slow. Each line lands in the dev server log (and in
 * Vercel's function logs), so a stall names itself.
 *
 * The retry: postgres.js connects lazily, so the FIRST query of a request
 * also pays for the TCP connect, TLS handshake and pooler auth. Over a slow
 * or lossy link (a phone hotspot, say) that alone can outlast a timeout
 * sized for a warm connection — which is exactly how this surfaced: the
 * `leads` query, first in the sequence, blew an 8s deadline while every
 * later query on the now-warm connection returned in milliseconds. Retrying
 * is safe because these are read-only SELECTs: re-running one cannot
 * double-apply anything.
 */
async function timedQuery<T>(label: string, run: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= QUERY_ATTEMPTS; attempt += 1) {
    const started = Date.now();
    try {
      const result = await withDeadline(run(), QUERY_TIMEOUT_MS, `Insights "${label}" query`);
      const suffix = attempt > 1 ? ` (attempt ${attempt})` : "";
      console.log(`[insights] ${label}: ok in ${Date.now() - started}ms${suffix}`);
      return result;
    } catch (error) {
      lastError = error;
      const elapsed = Date.now() - started;
      const transient = isDeadlineExceeded(error) || isDatabaseUnreachable(error);
      if (!transient || attempt === QUERY_ATTEMPTS) {
        console.error(`[insights] ${label}: FAILED after ${elapsed}ms`, error);
        break;
      }
      console.warn(
        `[insights] ${label}: no answer in ${elapsed}ms — retrying once (the first query also opens the connection)`,
      );
    }
  }
  throw lastError;
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
        a query just took too long to come back, twice. On a slow or intermittent link (a phone
        hotspot, patchy wifi) opening the connection alone can take this long; reloading often
        works because the connection is then warm. The dev server log — or Vercel&apos;s function
        log — names which query, on a line beginning{" "}
        <code className="font-mono">[insights]</code>. If it persists on a good connection, check
        whether the Supabase project is paused (the dashboard will say so and offer Restore), and
        run <code className="font-mono">npm run db:check</code>.
      </p>
    </div>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "report.read")) return <AccessDenied />;

  // Three separate permission codes, not one scoped permission — the
  // widest one the caller holds decides how much they see. See
  // docs/DECISIONS.md for why this reads code presence rather than
  // scopeFor()'s per-permission scope attribute.
  const scope = can(user, "report.org") ? "all" : can(user, "report.center") ? "center" : "own";

  const params = await searchParams;
  const readOne = (key: string): string => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" ? value.trim() : "";
  };

  const supabase = await createClient();
  // field_definitions is world-readable to any authenticated user
  // (migration 0001), so this works for the report-only roles too — the
  // whole point of reading the lead rows over the direct connection.
  const schema = await getFieldSchema(supabase, "lead", user);
  const dimensions: PivotField[] = [
    CREATED_AT_DIMENSION,
    ...dimensionFields(
      schema.map((f) => ({ key: f.key, label: f.label, type: f.type, isCore: f.isCore })),
    ),
  ];

  const filters = readFilterValues(params, dimensions);
  const groupByKey = readOne("group");
  const groupBy =
    dimensions.find((d) => d.key === groupByKey) ??
    dimensions.find((d) => d.key === "lead_source") ??
    dimensions[0];

  const from = DATE_ONLY.test(readOne("from")) ? readOne("from") : "";
  const to = DATE_ONLY.test(readOne("to")) ? readOne("to") : "";

  const scopeWhere =
    scope === "all"
      ? isNull(leads.deletedAt)
      : scope === "center"
        ? and(isNull(leads.deletedAt), inArray(leads.centerId, user.centerIds))
        : and(isNull(leads.deletedAt), eq(leads.assignedTo, user.id));

  // The date range is the one filter pushed into SQL: it is what actually
  // bounds how many rows come back. Everything else is applied in memory,
  // where the same bucketing that draws the chart decides what matches —
  // one definition of "Kochi" rather than two that can drift.
  // Boundaries are Asia/Kolkata days, not UTC ones, because that is what
  // "leads created on the 3rd" means to everyone using this.
  const dateWhere = [
    from ? gte(leads.createdAt, new Date(`${from}T00:00:00+05:30`)) : undefined,
    to ? lte(leads.createdAt, new Date(`${to}T23:59:59.999+05:30`)) : undefined,
  ].filter((clause): clause is NonNullable<typeof clause> => clause !== undefined);

  // Only dimension columns are ever selected — see the module comment.
  const leadColumns = getTableColumns(leads);
  const columnByDbName = new Map(
    Object.values(leadColumns).map((column) => [column.name, column as PgColumn]),
  );
  const selection: Record<string, PgColumn> = { id: leads.id, stageId: leads.stageId };
  let needsCustom = false;
  for (const field of dimensions) {
    if (!field.isCore) {
      needsCustom = true;
      continue;
    }
    const column = columnByDbName.get(fieldColumn(field.key));
    // A core field whose column was renamed or dropped simply stops being
    // a dimension rather than breaking the page.
    if (column) selection[`v_${field.key}`] = column;
  }
  if (needsCustom) selection.custom = leads.custom;

  let leadRows: Array<Record<string, unknown>>;
  let stageRows, centerRows, profileRows;
  try {
    leadRows = (await timedQuery("leads", () =>
      db
        .select(selection)
        .from(leads)
        .where(and(scopeWhere, ...dateWhere)),
    )) as Array<Record<string, unknown>>;
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

  // Stage, centre and counsellor names come from the same direct
  // connection as the counts. resolveFieldOptions() would go through RLS,
  // and `profiles` is only readable to whoever holds users.manage — a
  // centre head would get a table of uuids where names belong.
  const localOptions: Record<string, FieldOption[]> = {
    stage_id: stageRows
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ value: s.id, label: s.name })),
    center_id: centerRows.map((c) => ({ value: c.id, label: c.name })),
  };
  const staffOptions: FieldOption[] = profileRows
    .map((p) => ({ value: p.id, label: p.fullName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const optionEntries = await Promise.all(
    dimensions.map(async (field): Promise<[string, FieldOption[]]> => {
      if (localOptions[field.key]) return [field.key, localOptions[field.key]];
      if (field.type === "user_ref") return [field.key, staffOptions];
      if (field.type === "boolean") {
        return [field.key, [{ value: "true", label: "Yes" }, { value: "false", label: "No" }]];
      }
      if (!OPTION_BEARING_TYPES.has(field.type)) return [field.key, []];
      const definition = schema.find((f) => f.key === field.key);
      if (!definition) return [field.key, []];
      return [field.key, await resolveFieldOptions(supabase, definition)];
    }),
  );
  const optionsByKey = new Map(optionEntries);
  const labelsFor = (key: string): ReadonlyMap<string, string> =>
    new Map((optionsByKey.get(key) ?? []).map((option) => [option.value, option.label]));

  const pivotLeads: PivotLead[] = leadRows.map((row) => {
    const custom = (row.custom ?? null) as Record<string, unknown> | null;
    const values: Record<string, unknown> = {};
    for (const field of dimensions) {
      values[field.key] = field.isCore ? (row[`v_${field.key}`] ?? null) : (custom?.[field.key] ?? null);
    }
    return { id: String(row.id), stageId: (row.stageId as string | null) ?? null, values };
  });

  const stageTypeById = new Map(stageRows.map((s) => [s.id, s.stageType]));
  const filtered = applyPivotFilters(pivotLeads, dimensions, filters);
  const totals = summarise(filtered, stageTypeById);
  const rows = groupLeads(filtered, groupBy, stageTypeById, labelsFor(groupBy.key));
  const funnel = aggregateFunnel(
    filtered.map((lead) => ({
      id: lead.id,
      stageId: lead.stageId,
      assignedTo: null,
      centerId: null,
      firstTouchSource: null,
    })),
    stageRows,
  );

  const controls: DimensionControl[] = dimensions.map((field) => ({
    field,
    options: optionsByKey.get(field.key) ?? [],
  }));
  const activeFilterCount = Object.values(filters).filter((v) => v.trim().length > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-sm text-muted-foreground">
          Filter on any lead variable, then break the result down by any other. Every setting is
          in the address bar, so a view you like can be bookmarked or sent to someone.
        </p>
      </div>

      <InsightControls
        dimensions={controls}
        groupBy={groupBy.key}
        from={from}
        to={to}
        activeCount={activeFilterCount}
      />

      <section className="grid gap-4 sm:grid-cols-4">
        <Stat label="Leads in view" value={String(totals.total)} />
        <Stat label="Won" value={String(totals.won)} />
        <Stat label="Lost" value={String(totals.lost)} />
        <Stat
          label="Conversion"
          value={totals.total > 0 ? `${((totals.won / totals.total) * 100).toFixed(0)}%` : "—"}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">By {groupBy.label.toLowerCase()}</h2>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No leads match these filters.
          </p>
        ) : (
          <>
            <BreakdownChart data={rows} />
            {rows.length > 15 && (
              <p className="text-xs text-muted-foreground">
                The chart shows the 15 biggest; the table below has all {rows.length}.
              </p>
            )}
            {oversubscribed(rows, totals.total) && (
              <p className="text-xs text-muted-foreground">
                {groupBy.label} can hold more than one value per lead, so these rows add up to
                more than {totals.total}.
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{groupBy.label}</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Lost</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.bucket}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right">{row.total}</TableCell>
                    <TableCell className="text-right">{row.won}</TableCell>
                    <TableCell className="text-right">{row.lost}</TableCell>
                    <TableCell className="text-right">
                      {row.total > 0 ? `${((row.won / row.total) * 100).toFixed(0)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {totals.total > 0 ? `${((row.total / totals.total) * 100).toFixed(0)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Funnel</h2>
        <p className="text-sm text-muted-foreground">
          The same filtered set, by pipeline stage.
        </p>
        <FunnelChart data={funnel} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
