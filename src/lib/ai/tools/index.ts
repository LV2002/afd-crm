import { and, count, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { z } from "zod";

import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { centers, leads, pipelineStages, profiles } from "@/lib/db/schema";
import {
  aggregateCentrePerformance,
  aggregateFunnel,
  aggregateLeadsBySource,
  aggregateScorecard,
} from "@/lib/reports/aggregate-leads";

import { allowedCenterIds, analystScope, leadScopeWhere } from "./scope";

/**
 * The complete set of things the AI analyst can do.
 *
 * CLAUDE.md § AI analyst rules: `/ask` must NEVER generate SQL against the
 * live database. Every tool here takes typed arguments, runs a query this
 * file wrote, and returns aggregated rows. The model chooses which tool and
 * with what arguments; it never supplies a query, a column, or a table
 * name, so the worst a bad or adversarial question can do is call the wrong
 * one of these and get a number back.
 *
 * Two rules hold for every tool:
 *
 *  1. It receives the caller's `SessionUser` and applies `leadScopeWhere`,
 *     which reproduces the same boundary RLS would. The analyst therefore
 *     cannot become a way to read around a permission.
 *  2. It returns AGGREGATES ONLY — counts, rates, group labels. No name, no
 *     phone, no email ever enters a tool result, so nothing here can turn
 *     into a bulk export of contact details (CLAUDE.md § Non-negotiables 6).
 */

export interface AnalystContext {
  user: SessionUser;
}

export interface AnalystTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(rawArgs: unknown, ctx: AnalystContext): Promise<unknown>;
}

const dateRange = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

type DateRange = z.infer<typeof dateRange>;

function createdWithin(range: DateRange) {
  const clauses = [];
  if (range.from) clauses.push(gte(leads.createdAt, new Date(`${range.from}T00:00:00Z`)));
  // `to` is inclusive of the whole day: a person asking for "up to the 30th"
  // means the 30th, not midnight at its start.
  if (range.to) clauses.push(lte(leads.createdAt, new Date(`${range.to}T23:59:59.999Z`)));
  return clauses;
}

const DATE_RANGE_SCHEMA = {
  from: { type: "string", description: "Start date, inclusive, as YYYY-MM-DD. Omit for all time." },
  to: { type: "string", description: "End date, inclusive, as YYYY-MM-DD. Omit for up to now." },
} as const;

async function scopedLeadRows(ctx: AnalystContext, range: DateRange) {
  const where = and(leadScopeWhere(ctx.user), ...createdWithin(range));
  return db
    .select({
      id: leads.id,
      assignedTo: leads.assignedTo,
      centerId: leads.centerId,
      stageId: leads.stageId,
      firstTouchSource: leads.firstTouchSource,
    })
    .from(leads)
    .where(where);
}

async function stageRows() {
  return db
    .select({
      id: pipelineStages.id,
      name: pipelineStages.name,
      sortOrder: pipelineStages.sortOrder,
      stageType: pipelineStages.stageType,
    })
    .from(pipelineStages);
}

export const ANALYST_TOOLS: AnalystTool[] = [
  {
    name: "leads_by_source",
    description:
      "Count leads grouped by where they came from (their first-touch source), optionally within a date range. Use for questions about which channels produce volume.",
    inputSchema: { type: "object", properties: { ...DATE_RANGE_SCHEMA }, additionalProperties: false },
    async run(rawArgs, ctx) {
      const args = dateRange.parse(rawArgs ?? {});
      const rows = await scopedLeadRows(ctx, args);
      return { totalLeads: rows.length, bySource: aggregateLeadsBySource(rows) };
    },
  },
  {
    name: "funnel_snapshot",
    description:
      "How many leads currently sit at each pipeline stage, in stage order. Use for questions about where leads are stuck or how the funnel looks right now.",
    inputSchema: { type: "object", properties: { ...DATE_RANGE_SCHEMA }, additionalProperties: false },
    async run(rawArgs, ctx) {
      const args = dateRange.parse(rawArgs ?? {});
      const [rows, stages] = await Promise.all([scopedLeadRows(ctx, args), stageRows()]);
      return { totalLeads: rows.length, funnel: aggregateFunnel(rows, stages) };
    },
  },
  {
    name: "conversion_by_counsellor",
    description:
      "Per-counsellor totals, won, lost and conversion rate. Returns nothing for a caller who can only see their own leads, since a scorecard of one person is not a comparison.",
    inputSchema: { type: "object", properties: { ...DATE_RANGE_SCHEMA }, additionalProperties: false },
    async run(rawArgs, ctx) {
      const args = dateRange.parse(rawArgs ?? {});
      // Matches the Insights page: a scorecard is a comparison between
      // people, so it is withheld from own-scope callers rather than shown
      // as a single row about themselves.
      if (analystScope(ctx.user) === "own") {
        return { scorecard: [], note: "Counsellor comparison needs centre-wide or org-wide report access." };
      }
      const [rows, stages] = await Promise.all([scopedLeadRows(ctx, args), stageRows()]);
      const nameRows = await db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles);
      return { scorecard: aggregateScorecard(rows, stages, new Map(nameRows.map((p) => [p.id, p.fullName]))) };
    },
  },
  {
    name: "centre_performance",
    description:
      "Totals, won, lost and conversion rate per centre. Only covers centres the caller may see.",
    inputSchema: { type: "object", properties: { ...DATE_RANGE_SCHEMA }, additionalProperties: false },
    async run(rawArgs, ctx) {
      const args = dateRange.parse(rawArgs ?? {});
      if (analystScope(ctx.user) === "own") {
        return { centres: [], note: "Centre comparison needs centre-wide or org-wide report access." };
      }
      const [rows, stages] = await Promise.all([scopedLeadRows(ctx, args), stageRows()]);
      const centreRows = await db.select({ id: centers.id, name: centers.name }).from(centers);
      return {
        centres: aggregateCentrePerformance(rows, stages, new Map(centreRows.map((c) => [c.id, c.name]))),
      };
    },
  },
  {
    name: "lost_reason_breakdown",
    description:
      "Why leads were lost, counted by reason. Use for questions about why deals fall through.",
    inputSchema: { type: "object", properties: { ...DATE_RANGE_SCHEMA }, additionalProperties: false },
    async run(rawArgs, ctx) {
      const args = dateRange.parse(rawArgs ?? {});
      const rows = await db
        .select({ reason: leads.lostReason, total: count() })
        .from(leads)
        .where(and(leadScopeWhere(ctx.user), isNotNull(leads.lostReason), ...createdWithin(args)))
        .groupBy(leads.lostReason)
        .orderBy(desc(count()));
      return { lostReasons: rows.map((r) => ({ reason: r.reason ?? "Unspecified", count: r.total })) };
    },
  },
  {
    name: "sla_breaches",
    description:
      "How many leads are currently breaching their first-response SLA, and how many are still unassigned. Use for questions about responsiveness or neglected leads.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run(_rawArgs, ctx) {
      const scoped = leadScopeWhere(ctx.user);
      const [[breaching], [unassigned], [noFirstResponse]] = await Promise.all([
        db.select({ total: count() }).from(leads).where(and(scoped, eq(leads.slaBreached, true))),
        db.select({ total: count() }).from(leads).where(and(scoped, isNull(leads.assignedTo))),
        db.select({ total: count() }).from(leads).where(and(scoped, isNull(leads.firstResponseAt))),
      ]);
      return {
        breachingSla: breaching?.total ?? 0,
        unassigned: unassigned?.total ?? 0,
        awaitingFirstResponse: noFirstResponse?.total ?? 0,
      };
    },
  },
  {
    name: "list_centres",
    description:
      "The centres this caller may report on, with their ids and names. Call this first if a question names a centre, to find out whether the caller can see it at all.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run(_rawArgs, ctx) {
      const permitted = allowedCenterIds(ctx.user, undefined);
      const rows = await db.select({ id: centers.id, name: centers.name }).from(centers);
      const visible = permitted === null ? rows : rows.filter((c) => permitted.includes(c.id));
      return { centres: visible };
    },
  },
  {
    name: "pipeline_value",
    description:
      "Count of leads by temperature (hot/warm/cold and so on), for a sense of how much live interest there is.",
    inputSchema: { type: "object", properties: { ...DATE_RANGE_SCHEMA }, additionalProperties: false },
    async run(rawArgs, ctx) {
      const args = dateRange.parse(rawArgs ?? {});
      const rows = await db
        .select({ temperature: leads.temperature, total: count() })
        .from(leads)
        .where(and(leadScopeWhere(ctx.user), ...createdWithin(args)))
        .groupBy(leads.temperature)
        .orderBy(desc(count()));
      return { byTemperature: rows.map((r) => ({ temperature: r.temperature ?? "Unset", count: r.total })) };
    },
  },
];

export const TOOLS_BY_NAME = new Map(ANALYST_TOOLS.map((tool) => [tool.name, tool]));

/** Anthropic tool definitions, derived from the same list the runner executes. */
export function anthropicToolDefinitions() {
  return ANALYST_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as { type: "object"; properties: Record<string, unknown> },
  }));
}

/**
 * Runs a tool the model asked for.
 *
 * An unknown name returns an error result rather than throwing: the model
 * occasionally invents a plausible-sounding tool, and telling it so lets it
 * correct itself on the next turn instead of failing the whole request.
 * The same is true of bad arguments, which zod rejects here.
 */
export async function runAnalystTool(
  name: string,
  args: unknown,
  ctx: AnalystContext,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return { ok: false, error: `No such tool: ${name}` };
  try {
    return { ok: true, result: await tool.run(args, ctx) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: `Invalid arguments: ${error.issues.map((i) => i.message).join("; ")}` };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Tool failed." };
  }
}
