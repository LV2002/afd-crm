import { addDays } from './dates.ts';
import type { AnalyticsReader } from './reader.ts';

export interface Delta {
  readonly current: number;
  readonly previous: number;
  // undefined when there was nothing to compare with (previous was zero)
  readonly changePct: number | undefined;
}

export interface Dashboard {
  readonly range: { readonly from: string; readonly to: string; readonly prevFrom: string; readonly prevTo: string };
  readonly clicks: Delta;
  readonly impressions: Delta;
  readonly position: Delta; // average position, weighted by impressions; lower is better
  readonly sessions: Delta;
  readonly users: Delta;
  readonly leads: Delta;
  readonly clicksByDay: readonly number[];
  readonly sessionsByDay: readonly number[];
  readonly topPages: readonly { page: string; clicks: number; impressions: number; position: number; clicksChangePct: number | undefined }[];
  readonly topQueries: readonly { query: string; clicks: number; impressions: number; position: number }[];
  // Searches where a page already ranks just off page one: the cheapest wins.
  readonly opportunities: readonly { page: string; query: string; impressions: number; position: number }[];
  readonly sources: readonly { source: string; sessions: number }[];
  readonly hasData: boolean;
}

const WINDOW_DAYS = 28;
// Search Console runs about two days behind, so the newest two days are left out rather than shown as a false dip.
const LAG_DAYS = 2;

const delta = (current: number, previous: number): Delta => ({ current, previous, changePct: previous === 0 ? undefined : ((current - previous) / previous) * 100 });

export function buildDashboard(reader: AnalyticsReader, today: string): Dashboard {
  const to = addDays(today, -LAG_DAYS);
  const from = addDays(to, -(WINDOW_DAYS - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(WINDOW_DAYS - 1));
  const g = reader.gscTotals(from, to);
  const gp = reader.gscTotals(prevFrom, prevTo);
  const a = reader.ga4Totals(from, to);
  const ap = reader.ga4Totals(prevFrom, prevTo);
  const pos = (t: { impressions: number; positionSum: number }): number => (t.impressions === 0 ? 0 : t.positionSum / t.impressions);
  const before = new Map(reader.gscTopPages(prevFrom, prevTo, 500).map((p) => [p.page, p.clicks]));
  return {
    range: { from, to, prevFrom, prevTo },
    clicks: delta(g.clicks, gp.clicks), impressions: delta(g.impressions, gp.impressions), position: delta(pos(g), pos(gp)),
    sessions: delta(a.sessions, ap.sessions), users: delta(a.users, ap.users), leads: delta(reader.ga4Leads(from, to), reader.ga4Leads(prevFrom, prevTo)),
    clicksByDay: reader.gscDaily(from, to).map((d) => d.clicks), sessionsByDay: reader.ga4Daily(from, to).map((d) => d.sessions),
    topPages: reader.gscTopPages(from, to, 15).map((p) => { const was = before.get(p.page); return { ...p, clicksChangePct: was === undefined || was === 0 ? undefined : ((p.clicks - was) / was) * 100 }; }),
    topQueries: reader.gscTopQueries(from, to, 15),
    opportunities: reader.gscPageQueries().filter((r) => r.position > 4 && r.position <= 15 && r.impressions >= 30).sort((x, y) => y.impressions - x.impressions).slice(0, 15),
    sources: reader.ga4Sources(from, to, 8),
    hasData: g.impressions > 0 || a.sessions > 0,
  };
}
