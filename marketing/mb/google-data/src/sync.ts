import { readFileSync } from 'node:fs';
import { GoogleAnalytics4, GoogleSearchConsole, SqliteAnalytics, analyticsMigrations, syncAnalytics, type SyncSummary } from '@mb/analytics';
import { GoogleAuth, istDate, migrate, openDb, systemClock, type Clock, type Db, type FetchFn } from '@mb/platform';
import { z } from 'zod';

export const GoogleConfigSchema = z.object({ gscSite: z.string().min(3), ga4PropertyId: z.string().regex(/^\d+$/) });
export type GoogleConfig = z.infer<typeof GoogleConfigSchema>;

export interface GoogleDataOptions {
  readonly keyPath: string; // service account JSON; lives outside the repository, never logged
  readonly config: GoogleConfig;
  readonly dbPath: string; // ':memory:' in tests
  readonly fetch?: FetchFn;
  readonly clock?: Clock;
}

export interface GoogleData { readonly db: Db; readonly store: SqliteAnalytics; readonly clock: Clock; readonly auth: GoogleAuth; sync(progress?: (pct: number, note: string) => void): Promise<SyncSummary> }

// Search Console and Analytics 4 read with one read-only service account, kept in a local SQLite file (ported from Marketing Brain's analytics package).
export function openGoogleData(o: GoogleDataOptions): GoogleData {
  const clock = o.clock ?? systemClock;
  const fetchFn = o.fetch ?? (globalThis.fetch as unknown as FetchFn);
  const db = openDb(o.dbPath);
  migrate(db, analyticsMigrations, clock);
  const store = new SqliteAnalytics(db);
  const auth = new GoogleAuth({ readKeyFile: () => readFileSync(o.keyPath, 'utf8'), fetch: fetchFn, clock });
  const search = new GoogleSearchConsole({ auth, fetch: fetchFn, site: o.config.gscSite });
  const traffic = new GoogleAnalytics4({ auth, fetch: fetchFn, propertyId: o.config.ga4PropertyId });
  return { db, store, clock, auth, sync: (progress) => syncAnalytics({ search, traffic, store, clock, today: () => istDate(clock.now()), ...(progress === undefined ? {} : { progress }) }) };
}
