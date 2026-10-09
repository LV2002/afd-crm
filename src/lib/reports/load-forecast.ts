import "server-only";

import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import {
  centers,
  enrolments,
  leads,
  payments,
  profiles,
  targets,
  userCenters,
} from "@/lib/db/schema";
import { startOfMonthIST } from "@/lib/format/date";
import { indexByValue, isClosedKind } from "@/lib/leads/temperature-kinds";
import { loadTemperatureOptionsDirect } from "@/lib/leads/temperature-options-direct";

import { temperatureProbability, weightedPipeline, type WeightedPipeline } from "./forecast";
import { reportScopeFor } from "./load-report-leads";

/**
 * Everything the targets screen needs, in one read.
 *
 * Same trade as `load-report-leads`: the direct client, because
 * `report.read` is meant to work for roles that do not hold `lead.read`,
 * and therefore the centre scope is enforced here in `scopeWhere` rather
 * than by RLS. Nothing row-level is returned — counts, sums and a
 * counsellor's own name, which they can already see in the sidebar.
 *
 * ## Won, lost and parked are not "open"
 *
 * The weighted pipeline counts leads that could still become admissions.
 * A won lead has already been counted as an admission and would be
 * counted twice; a lost one is not coming back; a future prospect is
 * somebody who told us to call next year, and treating them as 15%-likely
 * this month is how a forecast quietly inflates itself. Which temperatures
 * those are is their `kind`, not their name.
 */

export type TargetMetric = "leads" | "admissions" | "revenue";

export interface ForecastRow {
  key: string;
  kind: "org" | "center" | "owner";
  label: string;
  centerId: string | null;
  ownerId: string | null;
  targets: Record<TargetMetric, number | null>;
  achieved: Record<TargetMetric, number>;
}

export interface ForecastData {
  /** `yyyy-MM-dd`, the 1st of the current month in IST. */
  periodMonth: string;
  dayOfMonth: number;
  daysInMonth: number;
  rows: ForecastRow[];
  pipeline: WeightedPipeline;
  /** True when a temperature has no probability configured — the page says so rather than under-reporting. */
  hasUnweightedTemperatures: boolean;
}

function emptyTargets(): Record<TargetMetric, number | null> {
  return { leads: null, admissions: null, revenue: null };
}

function emptyAchieved(): Record<TargetMetric, number> {
  return { leads: 0, admissions: 0, revenue: 0 };
}

export async function loadForecast(user: SessionUser, now: Date): Promise<ForecastData> {
  const scope = reportScopeFor(user);

  const monthStart = startOfMonthIST(now);
  // IST has no DST, so the calendar arithmetic here is safe: the 1st of
  // next month minus the 1st of this one is exactly the number of days.
  const periodMonth = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(monthStart);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = parts.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const leadScope =
    scope === "all"
      ? isNull(leads.deletedAt)
      : scope === "center"
        ? and(isNull(leads.deletedAt), inArray(leads.centerId, user.centerIds))
        : and(isNull(leads.deletedAt), eq(leads.assignedTo, user.id));

  const [
    newLeads,
    admissions,
    collected,
    scopedLeads,
    targetRows,
    centerRows,
    profileRows,
    colleagueRows,
  ] = await Promise.all([
    db
      .select({ centerId: leads.centerId, ownerId: leads.assignedTo })
      .from(leads)
      .where(and(leadScope, gte(leads.createdAt, monthStart))),

    db
      .select({ centerId: leads.centerId, ownerId: leads.assignedTo })
      .from(enrolments)
      .innerJoin(leads, eq(leads.id, enrolments.leadId))
      .where(
        and(
          leadScope,
          isNull(enrolments.deletedAt),
          isNull(enrolments.droppedAt),
          isNotNull(enrolments.salesToAccountsAt),
          gte(enrolments.salesToAccountsAt, monthStart),
        ),
      ),

    // Signed, so a refund reduces the month rather than adding to it.
    // The ledger is append-only; a correction is a debit row, and
    // summing the absolute amounts would report a reversed payment
    // twice.
    db
      .select({
        centerId: leads.centerId,
        ownerId: leads.assignedTo,
        amount: sql<number>`sum(case when ${payments.direction} = 'credit' then ${payments.amountPaise} else -${payments.amountPaise} end)`,
      })
      .from(payments)
      .innerJoin(enrolments, eq(enrolments.id, payments.enrolmentId))
      .innerJoin(leads, eq(leads.id, enrolments.leadId))
      .where(and(leadScope, gte(payments.receivedAt, monthStart)))
      .groupBy(leads.centerId, leads.assignedTo),

    // Every lead in scope; which are still "open" is decided below from
    // the temperature's kind, which lives in a table this query does not
    // need to join.
    db
      .select({ leadId: leads.id, temperature: leads.temperature })
      .from(leads)
      .where(leadScope),

    db
      .select({
        centerId: targets.centerId,
        ownerId: targets.ownerId,
        metric: targets.metric,
        targetValue: targets.targetValue,
      })
      .from(targets)
      .where(and(eq(targets.periodMonth, periodMonth), isNull(targets.deletedAt))),

    db.select({ id: centers.id, name: centers.name }).from(centers),
    db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles),

    // Who counts as "one of mine" for a centre-scoped reader. Only
    // needed for that scope, and it is the same boundary the targets
    // RLS policy applies through shares_center_with() — a person-scoped
    // target carries no centre, so it has to be found through the
    // person.
    scope === "center" && user.centerIds.length > 0
      ? db
          .selectDistinct({ userId: userCenters.userId })
          .from(userCenters)
          .where(inArray(userCenters.centerId, user.centerIds))
      : Promise.resolve([] as Array<{ userId: string }>),
  ]);

  const colleagues = new Set(colleagueRows.map((row) => row.userId));
  const centerName = new Map(centerRows.map((row) => [row.id, row.name]));
  const profileName = new Map(profileRows.map((row) => [row.id, row.fullName]));

  const rows = new Map<string, ForecastRow>();

  function rowFor(kind: ForecastRow["kind"], id: string | null): ForecastRow | null {
    const key = kind === "org" ? "org" : `${kind}:${id}`;
    const existing = rows.get(key);
    if (existing) return existing;

    // Only build rows the caller is allowed to see. An org row is a
    // management figure — a counsellor reading "60 admissions" as their
    // own number would be reading twenty times what they were asked for.
    if (kind === "org" && scope !== "all") return null;
    if (kind === "center") {
      if (!id) return null;
      if (scope === "own") return null;
      if (scope === "center" && !user.centerIds.includes(id)) return null;
    }
    if (kind === "owner") {
      if (!id) return null;
      if (scope === "own" && id !== user.id) return null;
      // Somebody else's number only if you share a centre with them. A
      // target row exists for people with no activity this month, so
      // without this a centre head would see a counsellor from a centre
      // they have nothing to do with the moment that person is given a
      // number.
      if (scope === "center" && id !== user.id && !colleagues.has(id)) return null;
    }

    const created: ForecastRow = {
      key,
      kind,
      label:
        kind === "org"
          ? "Whole institute"
          : kind === "center"
            ? (centerName.get(id!) ?? "Unknown centre")
            : (profileName.get(id!) ?? "Unknown person"),
      centerId: kind === "center" ? id : null,
      ownerId: kind === "owner" ? id : null,
      targets: emptyTargets(),
      achieved: emptyAchieved(),
    };
    rows.set(key, created);
    return created;
  }

  function add(
    metric: TargetMetric,
    centerId: string | null,
    ownerId: string | null,
    value: number,
  ) {
    // The same event lands in up to three rows: the institute's, the
    // centre's, and the person's. They are three separate statements of
    // the same month, never a total — adding them is how a month reads
    // 300% achieved.
    const org = rowFor("org", null);
    if (org) org.achieved[metric] += value;
    if (centerId) {
      const row = rowFor("center", centerId);
      if (row) row.achieved[metric] += value;
    }
    if (ownerId) {
      const row = rowFor("owner", ownerId);
      if (row) row.achieved[metric] += value;
    }
  }

  // Targets first, so a scope with a target set but no activity yet still
  // gets a row — "0 of 30, and it is the 14th" is the single most useful
  // thing this screen can say, and it would be missing if rows only came
  // from activity.
  for (const target of targetRows) {
    const kind = target.centerId ? "center" : target.ownerId ? "owner" : "org";
    const row = rowFor(kind, target.centerId ?? target.ownerId ?? null);
    if (!row) continue;
    if (
      target.metric === "leads" ||
      target.metric === "admissions" ||
      target.metric === "revenue"
    ) {
      row.targets[target.metric] = target.targetValue;
    }
  }

  for (const lead of newLeads) add("leads", lead.centerId, lead.ownerId, 1);
  for (const admission of admissions) add("admissions", admission.centerId, admission.ownerId, 1);
  for (const row of collected) add("revenue", row.centerId, row.ownerId, Number(row.amount ?? 0));

  const statusByValue = indexByValue(await loadTemperatureOptionsDirect());
  const pipeline = weightedPipeline(
    scopedLeads
      .filter((lead) => {
        const status = lead.temperature ? statusByValue.get(lead.temperature) : undefined;
        return !isClosedKind(status?.kind);
      })
      .map((lead) => {
        const status = lead.temperature ? statusByValue.get(lead.temperature) : undefined;
        return {
          leadId: lead.leadId,
          temperature: lead.temperature,
          temperatureLabel: status?.label ?? lead.temperature ?? "No temperature",
          probability: temperatureProbability(status?.probability ?? null),
        };
      }),
  );

  const order = { org: 0, center: 1, owner: 2 } as const;

  return {
    periodMonth,
    dayOfMonth: day,
    daysInMonth,
    rows: [...rows.values()].sort(
      (a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label),
    ),
    pipeline,
    hasUnweightedTemperatures: pipeline.unweightedLeads > 0,
  };
}
