import type { Clock, Result } from '@mb/platform';
import { addDays } from '../domain/dates.ts';
import type { Source } from '../domain/types.ts';
import type { AnalyticsStore, SearchDemandPort, WebTrafficPort } from './ports.ts';

export interface SyncDeps {
  readonly search: SearchDemandPort;
  readonly traffic: WebTrafficPort;
  readonly store: AnalyticsStore;
  readonly clock: Clock;
  readonly today: () => string; // today in India, yyyy-mm-dd
  readonly progress?: (pct: number, note: string) => void;
}

export interface SyncSummary {
  readonly rows: number;
  readonly errors: readonly { readonly source: Source; readonly message: string }[];
}

const FIRST_BACKFILL_DAYS = 90;
// Google revises the newest days for a while, so each sync re-reads the last few days it already has.
const REREAD_DAYS = 4;
const PAGE_QUERY_DAYS = 28;

// The Monday of the week a date is in: one snapshot a week is kept, the newest of that week.
const mondayOf = (date: string): string => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

// Pulls whatever is missing from Search Console and Analytics. One source failing never stops the others.
export async function syncAnalytics(deps: SyncDeps): Promise<SyncSummary> {
  const today = deps.today();
  const to = addDays(today, -1);
  const errors: { source: Source; message: string }[] = [];
  let total = 0;

  const run = async <T>(source: Source, from: string, last: number, step: string, fetchRows: () => Promise<Result<T[], string>>, save: (rows: T[]) => void): Promise<void> => {
    deps.progress?.(last, step);
    const got = await fetchRows();
    if (!got.ok) { errors.push({ source, message: got.error }); deps.store.log({ at: deps.clock.now(), source, from, to, rows: 0, error: got.error }); return; }
    save(got.value);
    total += got.value.length;
    deps.store.log({ at: deps.clock.now(), source, from, to, rows: got.value.length, error: undefined });
  };
  const startFor = (source: Source): string => { const newest = deps.store.newestDate(source); return newest === undefined ? addDays(to, -FIRST_BACKFILL_DAYS) : addDays(newest, -REREAD_DAYS); };

  const f1 = startFor('gsc-pages'); await run('gsc-pages', f1, 5, 'Search Console: pages by day', () => deps.search.pageByDay(f1, to), (r) => { deps.store.upsertGscPages(r); });
  const f2 = startFor('gsc-queries'); await run('gsc-queries', f2, 25, 'Search Console: searches by day', () => deps.search.queryByDay(f2, to), (r) => { deps.store.upsertGscQueries(r); });
  const pq = addDays(to, -(PAGE_QUERY_DAYS - 1)); await run('gsc-page-queries', pq, 45, 'Search Console: what each page ranks for', () => deps.search.pageQueries(pq, to), (r) => { deps.store.replaceGscPageQueries(r); deps.store.snapshotPageQueries(mondayOf(today), r); });
  const f4 = startFor('ga4-pages'); await run('ga4-pages', f4, 60, 'Analytics: visits by page', () => deps.traffic.pageByDay(f4, to), (r) => { deps.store.upsertGa4Pages(r); });
  const f5 = startFor('ga4-leads'); await run('ga4-leads', f5, 78, 'Analytics: enquiries by page', () => deps.traffic.leadsByDay(f5, to), (r) => { deps.store.upsertGa4Leads(r); });
  const f6 = startFor('ga4-sources'); await run('ga4-sources', f6, 90, 'Analytics: where visitors come from', () => deps.traffic.sourcesByDay(f6, to), (r) => { deps.store.upsertGa4Sources(r); });
  return { rows: total, errors };
}
