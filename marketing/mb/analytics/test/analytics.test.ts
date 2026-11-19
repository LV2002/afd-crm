import { generateKeyPairSync } from 'node:crypto';
import { FakeClock, GoogleAuth, err, migrate, ok, openDb, platformMigrations, type Result } from '@mb/platform';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GoogleAnalytics4, GoogleSearchConsole, SqliteAnalytics, analyticsMigrations, buildDashboard, syncAnalytics,
  type Ga4LeadDay, type Ga4PageDay, type Ga4SourceDay, type GscPageDay, type GscPageQuery, type GscQueryDay, type SearchDemandPort, type WebTrafficPort,
} from '../src/index.ts';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keyFile = JSON.stringify({ client_email: 'engine@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });

// A fake Google: answers the token request, then each API call from a queue of canned bodies.
function fakeGoogle(bodies: { status?: number; json: unknown }[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = (url: string, init?: { body?: string }) => {
    if (url.includes('oauth2')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 'tok', expires_in: 3600 }) });
    calls.push({ url, body: JSON.parse(init?.body ?? '{}') as Record<string, unknown> });
    const next = bodies.shift() ?? { json: {} };
    return Promise.resolve({ ok: (next.status ?? 200) === 200, status: next.status ?? 200, json: () => Promise.resolve(next.json) });
  };
  const auth = new GoogleAuth({ readKeyFile: () => keyFile, fetch, clock: new FakeClock('2026-10-16T06:00:00Z') });
  return { calls, fetch, auth };
}

describe('Search Console adapter', () => {
  it('asks for the right dimensions and turns page addresses into paths', async () => {
    const g = fakeGoogle([{ json: { rows: [{ keys: ['2026-10-10', 'https://afdindia.com/page/nid-coaching?x=1'], clicks: 3, impressions: 40, position: 7.5 }] } }]);
    const r = await new GoogleSearchConsole({ auth: g.auth, fetch: g.fetch, site: 'sc-domain:afdindia.com' }).pageByDay('2026-10-01', '2026-10-15');
    expect(r).toEqual({ ok: true, value: [{ date: '2026-10-10', page: '/page/nid-coaching', clicks: 3, impressions: 40, position: 7.5 }] });
    expect(g.calls[0]?.url).toContain('sites/sc-domain%3Aafdindia.com/searchAnalytics/query');
    expect(g.calls[0]?.body).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-15', dimensions: ['date', 'page'] });
  });

  it('reads page and query pairs, and keeps asking while pages come back full', async () => {
    const full = Array.from({ length: 25_000 }, (_, i) => ({ keys: ['/a', `q${String(i)}`], clicks: 0, impressions: 1, position: 9 }));
    const g = fakeGoogle([{ json: { rows: full } }, { json: { rows: [{ keys: ['/a', 'last'], clicks: 1, impressions: 2, position: 3 }] } }]);
    const r = await new GoogleSearchConsole({ auth: g.auth, fetch: g.fetch, site: 's' }).pageQueries('2026-09-01', '2026-09-28');
    expect(r.ok && r.value).toHaveLength(25_001);
    expect(g.calls[1]?.body['startRow']).toBe(25_000);
  });

  it('says who to add when access is refused, and what failed otherwise', async () => {
    const refused = await new GoogleSearchConsole({ ...fakeGoogle([{ status: 403, json: {} }]), site: 'sc-domain:afdindia.com' }).queryByDay('2026-10-01', '2026-10-02');
    expect(!refused.ok && refused.error).toContain('engine@x.iam.gserviceaccount.com');
    const broken = await new GoogleSearchConsole({ ...fakeGoogle([{ status: 500, json: {} }]), site: 's' }).queryByDay('2026-10-01', '2026-10-02');
    expect(!broken.ok && broken.error).toContain('500');
  });
});

describe('Analytics adapter', () => {
  const dims = (...v: string[]) => v.map((value) => ({ value }));
  it('reads visits, enquiries (generate_lead events) and sources, with Google\'s compact dates', async () => {
    const g = fakeGoogle([
      { json: { rows: [{ dimensionValues: dims('20261010', '/page/a'), metricValues: dims('12', '9', '8') }] } },
      { json: { rows: [{ dimensionValues: dims('20261010', '/page/a'), metricValues: dims('2') }] } },
      { json: { rows: [{ dimensionValues: dims('20261010', 'google / organic'), metricValues: dims('30', '25') }] } },
    ]);
    const ga = new GoogleAnalytics4({ auth: g.auth, fetch: g.fetch, propertyId: '405959903' });
    expect(await ga.pageByDay('2026-10-01', '2026-10-15')).toEqual({ ok: true, value: [{ date: '2026-10-10', page: '/page/a', sessions: 12, users: 9, engagedSessions: 8 }] });
    expect(await ga.leadsByDay('2026-10-01', '2026-10-15')).toEqual({ ok: true, value: [{ date: '2026-10-10', page: '/page/a', leads: 2 }] });
    expect(await ga.sourcesByDay('2026-10-01', '2026-10-15')).toEqual({ ok: true, value: [{ date: '2026-10-10', source: 'google / organic', sessions: 30, users: 25 }] });
    expect(g.calls[0]?.url).toContain('properties/405959903:runReport');
    expect(JSON.stringify(g.calls[1]?.body['dimensionFilter'])).toContain('generate_lead');
  });

  it('says who to add as a Viewer when access is refused', async () => {
    const r = await new GoogleAnalytics4({ ...fakeGoogle([{ status: 403, json: {} }]), propertyId: '1' }).pageByDay('2026-10-01', '2026-10-02');
    expect(!r.ok && r.error).toContain('Viewer');
  });
});

// --- sync and dashboard ---

class FakeSearch implements SearchDemandPort {
  calls: string[] = [];
  fail = false;
  pages: GscPageDay[] = [];
  queries: GscQueryDay[] = [];
  pq: GscPageQuery[] = [];
  pageByDay(from: string, to: string): Promise<Result<GscPageDay[], string>> { this.calls.push(`pages ${from}..${to}`); return Promise.resolve(this.fail ? err('no access') : ok(this.pages)); }
  queryByDay(): Promise<Result<GscQueryDay[], string>> { return Promise.resolve(ok(this.queries)); }
  pageQueries(): Promise<Result<GscPageQuery[], string>> { return Promise.resolve(ok(this.pq)); }
}
class FakeTraffic implements WebTrafficPort {
  pages: Ga4PageDay[] = [];
  leads: Ga4LeadDay[] = [];
  sources: Ga4SourceDay[] = [];
  pageByDay(): Promise<Result<Ga4PageDay[], string>> { return Promise.resolve(ok(this.pages)); }
  leadsByDay(): Promise<Result<Ga4LeadDay[], string>> { return Promise.resolve(ok(this.leads)); }
  sourcesByDay(): Promise<Result<Ga4SourceDay[], string>> { return Promise.resolve(ok(this.sources)); }
}

let db: ReturnType<typeof openDb>;
let store: SqliteAnalytics;
let search: FakeSearch;
let traffic: FakeTraffic;
const clock = new FakeClock('2026-10-16T06:00:00Z');
const run = () => syncAnalytics({ search, traffic, store, clock, today: () => '2026-10-16' });

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db, [...platformMigrations, ...analyticsMigrations], clock);
  store = new SqliteAnalytics(db);
  search = new FakeSearch();
  traffic = new FakeTraffic();
});

describe('syncAnalytics', () => {
  it('backfills 90 days the first time, then only re-reads the last few days it already has', async () => {
    search.pages = [{ date: '2026-10-14', page: '/a', clicks: 1, impressions: 10, position: 6 }];
    await run();
    expect(search.calls[0]).toBe('pages 2026-07-17..2026-10-15');
    await run();
    expect(search.calls[1]).toBe('pages 2026-10-10..2026-10-15');
  });

  it('replaces a day Google revised instead of adding to it', async () => {
    search.pages = [{ date: '2026-10-14', page: '/a', clicks: 1, impressions: 10, position: 6 }];
    await run();
    search.pages = [{ date: '2026-10-14', page: '/a', clicks: 4, impressions: 30, position: 6 }];
    await run();
    expect(store.gscTotals('2026-10-14', '2026-10-14')).toMatchObject({ clicks: 4, impressions: 30 });
  });

  it('keeps going when one source fails, reports it, and writes it to the sync log', async () => {
    search.fail = true;
    traffic.pages = [{ date: '2026-10-14', page: '/a', sessions: 5, users: 4, engagedSessions: 3 }];
    const r = await run();
    expect(r.errors).toEqual([{ source: 'gsc-pages', message: 'no access' }]);
    expect(store.ga4Totals('2026-10-14', '2026-10-14').sessions).toBe(5);
    expect(store.lastSync()?.errors).toEqual(['gsc-pages: no access']);
  });
});

describe('buildDashboard', () => {
  const day = (date: string, clicks: number, impressions: number, position: number): GscPageDay => ({ date, page: '/page/a', clicks, impressions, position });

  it('compares the latest 28 days (leaving out the two newest, which Google has not finished) with the 28 before', async () => {
    // today 2026-10-16: window 2026-09-17..2026-10-14, previous 2026-08-20..2026-09-16
    search.pages = [day('2026-10-14', 20, 200, 4), day('2026-10-01', 10, 100, 8), day('2026-09-10', 10, 100, 10), day('2026-10-15', 99, 999, 1)];
    traffic.pages = [{ date: '2026-10-01', page: '/a', sessions: 50, users: 40, engagedSessions: 30 }, { date: '2026-09-10', page: '/a', sessions: 25, users: 20, engagedSessions: 10 }];
    traffic.leads = [{ date: '2026-10-01', page: '/a', leads: 6 }, { date: '2026-09-10', page: '/a', leads: 2 }];
    await run();
    const d = buildDashboard(store, '2026-10-16');
    expect(d.range).toEqual({ from: '2026-09-17', to: '2026-10-14', prevFrom: '2026-08-20', prevTo: '2026-09-16' });
    expect(d.clicks).toEqual({ current: 30, previous: 10, changePct: 200 });
    expect(d.impressions.current).toBe(300);
    expect(d.position.current).toBeCloseTo((4 * 200 + 8 * 100) / 300, 5);
    expect(d.sessions).toMatchObject({ current: 50, previous: 25, changePct: 100 });
    expect(d.leads).toMatchObject({ current: 6, previous: 2 });
    expect(d.hasData).toBe(true);
  });

  it('has no percentage when there was nothing before, and says so when there is no data', async () => {
    expect(buildDashboard(store, '2026-10-16').hasData).toBe(false);
    search.pages = [day('2026-10-01', 5, 50, 6)];
    await run();
    expect(buildDashboard(store, '2026-10-16').clicks.changePct).toBeUndefined();
  });

  it('lists searches where a page ranks just off page one, most impressions first, ignoring tiny ones', async () => {
    search.pq = [
      { page: '/a', query: 'nid coaching kochi', clicks: 1, impressions: 400, position: 8.2 },
      { page: '/a', query: 'already first', clicks: 50, impressions: 900, position: 1.4 },
      { page: '/b', query: 'nift coaching', clicks: 0, impressions: 700, position: 12 },
      { page: '/b', query: 'rare', clicks: 0, impressions: 5, position: 9 },
      { page: '/c', query: 'far away', clicks: 0, impressions: 800, position: 40 },
    ];
    await run();
    expect(buildDashboard(store, '2026-10-16').opportunities.map((o) => o.query)).toEqual(['nift coaching', 'nid coaching kochi']);
  });

  it('ranks top pages by clicks and shows each one\'s change from the previous window', async () => {
    search.pages = [day('2026-10-01', 30, 100, 5), day('2026-09-10', 10, 100, 5), { date: '2026-10-01', page: '/page/b', clicks: 5, impressions: 40, position: 9 }];
    await run();
    const d = buildDashboard(store, '2026-10-16');
    expect(d.topPages[0]).toMatchObject({ page: '/page/a', clicks: 30, clicksChangePct: 200 });
    expect(d.topPages[1]).toMatchObject({ page: '/page/b', clicksChangePct: undefined });
  });
});
