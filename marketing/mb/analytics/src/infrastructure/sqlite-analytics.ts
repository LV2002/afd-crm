import type { Db, Migration } from '@mb/platform';
import type { AnalyticsStore, SyncLogEntry } from '../application/ports.ts';
import type { AnalyticsReader, Totals } from '../domain/reader.ts';
import type { Ga4LeadDay, Ga4PageDay, Ga4SourceDay, GscPageDay, GscPageQuery, GscQueryDay, Source } from '../domain/types.ts';

export const analyticsMigrations: readonly Migration[] = [
  {
    id: 'analytics-001-snapshots',
    sql: `
      -- Daily snapshots of Search Console and Analytics. A cache of what Google reports, rebuilt by re-reading,
      -- so a day is replaced when Google revises it rather than versioned.
      CREATE TABLE gsc_page_day (date TEXT NOT NULL, page TEXT NOT NULL, clicks REAL NOT NULL, impressions REAL NOT NULL, position REAL NOT NULL, PRIMARY KEY (date, page));
      CREATE TABLE gsc_query_day (date TEXT NOT NULL, query TEXT NOT NULL, clicks REAL NOT NULL, impressions REAL NOT NULL, position REAL NOT NULL, PRIMARY KEY (date, query));
      CREATE TABLE gsc_page_query (page TEXT NOT NULL, query TEXT NOT NULL, clicks REAL NOT NULL, impressions REAL NOT NULL, position REAL NOT NULL, PRIMARY KEY (page, query));
      CREATE TABLE ga4_page_day (date TEXT NOT NULL, page TEXT NOT NULL, sessions REAL NOT NULL, users REAL NOT NULL, engaged_sessions REAL NOT NULL, PRIMARY KEY (date, page));
      CREATE TABLE ga4_lead_day (date TEXT NOT NULL, page TEXT NOT NULL, leads REAL NOT NULL, PRIMARY KEY (date, page));
      CREATE TABLE ga4_source_day (date TEXT NOT NULL, source TEXT NOT NULL, sessions REAL NOT NULL, users REAL NOT NULL, PRIMARY KEY (date, source));
      CREATE TABLE analytics_sync (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, source TEXT NOT NULL, from_date TEXT NOT NULL, to_date TEXT NOT NULL, rows INTEGER NOT NULL, error TEXT);
    `,
  },
  {
    id: 'analytics-002-page-query-snapshots',
    sql: `
      -- What each page ranked for, kept once a week, so a keyword's position can be followed over time (the daily tables hold pages and searches separately).
      CREATE TABLE gsc_page_query_snap (week TEXT NOT NULL, page TEXT NOT NULL, query TEXT NOT NULL, clicks REAL NOT NULL, impressions REAL NOT NULL, position REAL NOT NULL, PRIMARY KEY (week, page, query));
    `,
  },
];

const NEWEST: Record<Source, string> = { 'gsc-pages': 'gsc_page_day', 'gsc-queries': 'gsc_query_day', 'gsc-page-queries': 'gsc_page_query', 'ga4-pages': 'ga4_page_day', 'ga4-leads': 'ga4_lead_day', 'ga4-sources': 'ga4_source_day' };

export class SqliteAnalytics implements AnalyticsStore, AnalyticsReader {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  private many<T>(sql: string, rows: readonly T[], values: (r: T) => (string | number)[]): void {
    const stmt = this.db.prepare(sql);
    this.db.exec('BEGIN');
    try { for (const r of rows) stmt.run(...values(r)); this.db.exec('COMMIT'); } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  upsertGscPages(rows: readonly GscPageDay[]): void { this.many('INSERT OR REPLACE INTO gsc_page_day VALUES (?, ?, ?, ?, ?)', rows, (r) => [r.date, r.page, r.clicks, r.impressions, r.position]); }
  upsertGscQueries(rows: readonly GscQueryDay[]): void { this.many('INSERT OR REPLACE INTO gsc_query_day VALUES (?, ?, ?, ?, ?)', rows, (r) => [r.date, r.query, r.clicks, r.impressions, r.position]); }
  upsertGa4Pages(rows: readonly Ga4PageDay[]): void { this.many('INSERT OR REPLACE INTO ga4_page_day VALUES (?, ?, ?, ?, ?)', rows, (r) => [r.date, r.page, r.sessions, r.users, r.engagedSessions]); }
  upsertGa4Leads(rows: readonly Ga4LeadDay[]): void { this.many('INSERT OR REPLACE INTO ga4_lead_day VALUES (?, ?, ?)', rows, (r) => [r.date, r.page, r.leads]); }
  upsertGa4Sources(rows: readonly Ga4SourceDay[]): void { this.many('INSERT OR REPLACE INTO ga4_source_day VALUES (?, ?, ?, ?)', rows, (r) => [r.date, r.source, r.sessions, r.users]); }

  replaceGscPageQueries(rows: readonly GscPageQuery[]): void {
    this.db.exec('DELETE FROM gsc_page_query');
    this.many('INSERT OR REPLACE INTO gsc_page_query VALUES (?, ?, ?, ?, ?)', rows, (r) => [r.page, r.query, r.clicks, r.impressions, r.position]);
  }

  newestDate(source: Source): string | undefined {
    if (source === 'gsc-page-queries') return undefined;
    const row = this.db.prepare(`SELECT MAX(date) AS d FROM ${NEWEST[source]}`).get();
    return typeof row?.['d'] === 'string' ? row['d'] : undefined;
  }

  log(e: SyncLogEntry): void {
    this.db.prepare('INSERT INTO analytics_sync (at, source, from_date, to_date, rows, error) VALUES (?, ?, ?, ?, ?, ?)').run(e.at.toISOString(), e.source, e.from, e.to, e.rows, e.error ?? null);
  }

  gscTotals(from: string, to: string): Totals {
    const r = this.db.prepare('SELECT COALESCE(SUM(clicks), 0) AS c, COALESCE(SUM(impressions), 0) AS i, COALESCE(SUM(position * impressions), 0) AS p FROM gsc_page_day WHERE date BETWEEN ? AND ?').get(from, to);
    return { clicks: Number(r?.['c'] ?? 0), impressions: Number(r?.['i'] ?? 0), positionSum: Number(r?.['p'] ?? 0) };
  }

  gscDaily(from: string, to: string): { date: string; clicks: number }[] {
    return this.db.prepare('SELECT date, SUM(clicks) AS c FROM gsc_page_day WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date').all(from, to).map((r) => ({ date: String(r['date']), clicks: Number(r['c']) }));
  }

  gscTopPages(from: string, to: string, limit: number): { page: string; clicks: number; impressions: number; position: number }[] {
    return this.db.prepare('SELECT page, SUM(clicks) AS c, SUM(impressions) AS i, SUM(position * impressions) / NULLIF(SUM(impressions), 0) AS p FROM gsc_page_day WHERE date BETWEEN ? AND ? GROUP BY page ORDER BY c DESC, i DESC LIMIT ?').all(from, to, limit)
      .map((r) => ({ page: String(r['page']), clicks: Number(r['c']), impressions: Number(r['i']), position: Number(r['p'] ?? 0) }));
  }

  gscTopQueries(from: string, to: string, limit: number): { query: string; clicks: number; impressions: number; position: number }[] {
    return this.db.prepare('SELECT query, SUM(clicks) AS c, SUM(impressions) AS i, SUM(position * impressions) / NULLIF(SUM(impressions), 0) AS p FROM gsc_query_day WHERE date BETWEEN ? AND ? GROUP BY query ORDER BY c DESC, i DESC LIMIT ?').all(from, to, limit)
      .map((r) => ({ query: String(r['query']), clicks: Number(r['c']), impressions: Number(r['i']), position: Number(r['p'] ?? 0) }));
  }

  gscPageQueries(): { page: string; query: string; clicks: number; impressions: number; position: number }[] {
    return this.db.prepare('SELECT page, query, clicks, impressions, position FROM gsc_page_query').all().map((r) => ({ page: String(r['page']), query: String(r['query']), clicks: Number(r['clicks']), impressions: Number(r['impressions']), position: Number(r['position']) }));
  }

  snapshotPageQueries(week: string, rows: readonly GscPageQuery[]): void {
    this.many('INSERT OR REPLACE INTO gsc_page_query_snap VALUES (?, ?, ?, ?, ?, ?)', rows, (r) => [week, r.page, r.query, r.clicks, r.impressions, r.position]);
  }

  // One week's snapshot, or an empty list.
  pageQuerySnapshot(week: string): { page: string; query: string; clicks: number; impressions: number; position: number }[] {
    return this.db.prepare('SELECT page, query, clicks, impressions, position FROM gsc_page_query_snap WHERE week = ?').all(week).map((r) => ({ page: String(r['page']), query: String(r['query']), clicks: Number(r['clicks']), impressions: Number(r['impressions']), position: Number(r['position']) }));
  }

  snapshotWeeks(): string[] {
    return this.db.prepare('SELECT DISTINCT week FROM gsc_page_query_snap ORDER BY week').all().map((r) => String(r['week']));
  }

  ga4Totals(from: string, to: string): { sessions: number; users: number } {
    const r = this.db.prepare('SELECT COALESCE(SUM(sessions), 0) AS s, COALESCE(SUM(users), 0) AS u FROM ga4_page_day WHERE date BETWEEN ? AND ?').get(from, to);
    return { sessions: Number(r?.['s'] ?? 0), users: Number(r?.['u'] ?? 0) };
  }

  ga4PageSessions(from: string, to: string): { page: string; sessions: number }[] {
    return this.db.prepare('SELECT page, SUM(sessions) AS s FROM ga4_page_day WHERE date BETWEEN ? AND ? GROUP BY page').all(from, to).map((r) => ({ page: String(r['page']), sessions: Number(r['s']) }));
  }

  ga4LeadsByPage(from: string, to: string): { page: string; leads: number }[] {
    return this.db.prepare('SELECT page, SUM(leads) AS l FROM ga4_lead_day WHERE date BETWEEN ? AND ? GROUP BY page').all(from, to).map((r) => ({ page: String(r['page']), leads: Number(r['l']) }));
  }

  ga4Daily(from: string, to: string): { date: string; sessions: number }[] {
    return this.db.prepare('SELECT date, SUM(sessions) AS s FROM ga4_page_day WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date').all(from, to).map((r) => ({ date: String(r['date']), sessions: Number(r['s']) }));
  }

  ga4Leads(from: string, to: string): number {
    return Number(this.db.prepare('SELECT COALESCE(SUM(leads), 0) AS l FROM ga4_lead_day WHERE date BETWEEN ? AND ?').get(from, to)?.['l'] ?? 0);
  }

  ga4Sources(from: string, to: string, limit: number): { source: string; sessions: number }[] {
    return this.db.prepare('SELECT source, SUM(sessions) AS s FROM ga4_source_day WHERE date BETWEEN ? AND ? GROUP BY source ORDER BY s DESC LIMIT ?').all(from, to, limit).map((r) => ({ source: String(r['source']), sessions: Number(r['s']) }));
  }

  gscPageWindow(page: string, from: string, to: string): { clicks: number; impressions: number; positionSum: number } {
    const r = this.db.prepare('SELECT COALESCE(SUM(clicks), 0) AS c, COALESCE(SUM(impressions), 0) AS i, COALESCE(SUM(position * impressions), 0) AS p FROM gsc_page_day WHERE page = ? AND date BETWEEN ? AND ?').get(page, from, to);
    return { clicks: Number(r?.['c'] ?? 0), impressions: Number(r?.['i'] ?? 0), positionSum: Number(r?.['p'] ?? 0) };
  }

  ga4PageWindow(page: string, from: string, to: string): { sessions: number; leads: number } {
    const s = this.db.prepare('SELECT COALESCE(SUM(sessions), 0) AS s FROM ga4_page_day WHERE page = ? AND date BETWEEN ? AND ?').get(page, from, to);
    const l = this.db.prepare('SELECT COALESCE(SUM(leads), 0) AS l FROM ga4_lead_day WHERE page = ? AND date BETWEEN ? AND ?').get(page, from, to);
    return { sessions: Number(s?.['s'] ?? 0), leads: Number(l?.['l'] ?? 0) };
  }

  firstSearchDays(): Map<string, { firstImpression: string; firstClick: string | undefined }> {
    const rows = this.db.prepare('SELECT page, MIN(CASE WHEN impressions > 0 THEN date END) AS imp, MIN(CASE WHEN clicks > 0 THEN date END) AS clk FROM gsc_page_day GROUP BY page').all();
    return new Map(rows.flatMap((r) => (typeof r['imp'] === 'string' ? [[String(r['page']), { firstImpression: r['imp'], firstClick: typeof r['clk'] === 'string' ? r['clk'] : undefined }] as const] : [])));
  }

  firstDate(): string | undefined {
    const row = this.db.prepare('SELECT MIN(date) AS d FROM gsc_page_day').get();
    return typeof row?.['d'] === 'string' ? row['d'] : undefined;
  }

  lastSync(): { at: Date; errors: string[] } | undefined {
    const newest = this.db.prepare('SELECT MAX(at) AS at FROM analytics_sync').get();
    if (typeof newest?.['at'] !== 'string') return undefined;
    const errors = this.db.prepare('SELECT source, error FROM analytics_sync WHERE at = ? AND error IS NOT NULL').all(newest['at']).map((r) => `${String(r['source'])}: ${String(r['error'])}`);
    return { at: new Date(newest['at']), errors };
  }
}
