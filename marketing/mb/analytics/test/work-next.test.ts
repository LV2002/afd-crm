import { FakeClock, migrate, openDb, platformMigrations } from '@mb/platform';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_WORK_RULES, SqliteAnalytics, analyticsMigrations, buildWorkNext, dateRange, type WorkInput } from '../src/index.ts';

const TODAY = '2026-10-26';
const NOW = dateRange('2026-09-27', '2026-10-24'); // the 28 days the engine reads
const BEFORE = dateRange('2026-08-30', '2026-09-26');
let db: SqliteAnalytics;

beforeEach(() => {
  const raw = openDb(':memory:');
  migrate(raw, [...platformMigrations, ...analyticsMigrations], new FakeClock('2026-10-26T06:00:00Z'));
  db = new SqliteAnalytics(raw);
});

// One page's search results spread evenly over a window.
const page = (path: string, days: string[], perDay: { clicks: number; impressions: number; position: number }): void => {
  db.upsertGscPages(days.map((date) => ({ date, page: path, ...perDay })));
};
const visits = (path: string, perDay: number): void => { db.upsertGa4Pages(NOW.map((date) => ({ date, page: path, sessions: perDay, users: perDay, engagedSessions: perDay }))); };
const leads = (path: string, perDay: number): void => { db.upsertGa4Leads(NOW.map((date) => ({ date, page: path, leads: perDay }))); };
const input = (over: Partial<WorkInput> = {}): WorkInput => ({ today: TODAY, isProtected: (p) => p === '/page/nift-coaching-kochi', knownPages: [], deadlines: [], signals: new Map(), ...over });
const ids = (r: ReturnType<typeof buildWorkNext>): string[] => r.items.map((i) => i.id);

describe('not enough data', () => {
  it('says so instead of guessing', () => {
    page('/page/a', NOW, { clicks: 0, impressions: 2, position: 9 }); // 56 times shown
    const r = buildWorkNext(db, input());
    expect(r).toMatchObject({ enough: false, items: [] });
    expect(r.why).toContain('too little');
  });
});

describe('what to work on next', () => {
  beforeEach(() => {
    // plenty of search data, so the engine is willing to advise
    page('/page/home', NOW, { clicks: 60, impressions: 400, position: 2 });
    page('/page/home', BEFORE, { clicks: 60, impressions: 400, position: 2 });
    visits('/page/home', 20); leads('/page/home', 1);
  });

  it('finds a page just off page one, names its best search, and sizes the gain as an estimate', () => {
    page('/blog/post/nid-dat-preparation', NOW, { clicks: 1, impressions: 20, position: 8 });
    db.replaceGscPageQueries([{ page: '/blog/post/nid-dat-preparation', query: 'nid dat preparation', clicks: 5, impressions: 300, position: 8 }]);
    const item = buildWorkNext(db, input()).items.find((i) => i.id === 'near:/blog/post/nid-dat-preparation');
    expect(item).toMatchObject({ kind: 'near-page-one', goal: 'ranking', query: 'nid dat preparation', action: { type: 'rework', path: '/blog/post/nid-dat-preparation', keyword: 'nid dat preparation' } });
    expect(item?.headline).toContain('"nid dat preparation"');
    expect(item?.estimate?.text).toContain('an estimate');
    expect(item?.steps.join(' ')).toContain('40 to 60 words');
  });

  it('flags a page shown often at a good position that few people click, and leaves the page alone', () => {
    page('/page/uceed-coaching', NOW, { clicks: 0.2, impressions: 12, position: 3 });
    const item = buildWorkNext(db, input()).items.find((i) => i.id === 'ctr:/page/uceed-coaching');
    expect(item).toMatchObject({ kind: 'low-click-rate', goal: 'visibility' });
    expect(item?.evidence.join(' ')).toContain('typically get about 11.0%');
    expect(item?.steps.join(' ')).toContain('Leave the page address and the page text alone');
  });

  it('flags a page with visitors and far fewer enquiries than the site average, never under /publisher or /user', () => {
    page('/page/nata-coaching', NOW, { clicks: 1, impressions: 5, position: 20 });
    visits('/page/nata-coaching', 15);
    page('/publisher/course-x', NOW, { clicks: 1, impressions: 5, position: 20 });
    visits('/publisher/course-x', 15);
    const r = buildWorkNext(db, input());
    expect(ids(r)).toContain('conv:/page/nata-coaching');
    expect(ids(r)).not.toContain('conv:/publisher/course-x');
    const item = r.items.find((i) => i.id === 'conv:/page/nata-coaching');
    expect(item).toMatchObject({ goal: 'conversion', action: { type: 'offers' } });
    expect(item?.steps.join(' ')).toContain('must not change how the page ranks');
  });

  it('flags a page losing clicks, and says when it still names an old year', () => {
    page('/page/ceed-exam', BEFORE, { clicks: 2, impressions: 30, position: 6 });
    page('/page/ceed-exam', NOW, { clicks: 0.7, impressions: 30, position: 9 });
    const r = buildWorkNext(db, input({ signals: new Map([['/page/ceed-exam', { staleYear: true }]]) }));
    const item = r.items.find((i) => i.id === 'fall:/page/ceed-exam');
    expect(item).toMatchObject({ kind: 'falling', goal: 'ranking' });
    expect(item?.evidence.join(' ')).toContain('old year');
  });

  it('suggests a new page for searches nothing answers, grouped, never for fees, and urgent when a deadline is close', () => {
    db.upsertGscQueries(NOW.flatMap((date) => [
      { date, query: 'nift syllabus', clicks: 0, impressions: 2, position: 35 },
      { date, query: 'nift exam pattern', clicks: 0, impressions: 1, position: 40 },
      { date, query: 'nift coaching fees', clicks: 0, impressions: 5, position: 30 },
      { date, query: 'uceed eligibility', clicks: 0, impressions: 3, position: 12 },
    ]));
    db.replaceGscPageQueries([{ page: '/page/home', query: 'nift syllabus', clicks: 0, impressions: 56, position: 35 }, { page: '/page/home', query: 'uceed eligibility', clicks: 0, impressions: 84, position: 12 }]);
    const r = buildWorkNext(db, input({ deadlines: [{ exam: 'NIFT', label: 'NIFT registration closes', date: '2026-11-16' }] }));
    const item = r.items.find((i) => i.id === 'new:NIFT|syllabus');
    expect(item).toMatchObject({ kind: 'new-page', goal: 'new-content', headline: 'No page answers "NIFT syllabus and exam pattern" yet', urgent: 'NIFT registration closes in 21 days', action: { type: 'new-post', keyword: 'nift syllabus' } });
    expect(item?.evidence.join(' ')).toContain('"nift syllabus"');
    expect(JSON.stringify(r.items)).not.toMatch(/fees/);
    expect(ids(r).some((id) => id.includes('uceed'))).toBe(false);
  });

  it('does not suggest a page the site already has', () => {
    db.upsertGscQueries(NOW.map((date) => ({ date, query: 'nift syllabus', clicks: 0, impressions: 3, position: 35 })));
    db.replaceGscPageQueries([{ page: '/blog/post/nift-syllabus', query: 'nift syllabus', clicks: 0, impressions: 84, position: 35 }]);
    expect(ids(buildWorkNext(db, input({ knownPages: ['/blog/post/nift-syllabus'] })))).not.toContain('new:NIFT|syllabus');
  });

  it('never advises on the protected city pages', () => {
    page('/page/nift-coaching-kochi', NOW, { clicks: 0, impressions: 20, position: 8 });
    page('/page/nift-coaching-kochi', BEFORE, { clicks: 5, impressions: 20, position: 3 });
    expect(JSON.stringify(buildWorkNext(db, input()).items)).not.toContain('nift-coaching-kochi');
  });

  it('puts "no enquiries are recorded" first when there are visits but not one enquiry anywhere', () => {
    db.upsertGa4Leads(NOW.map((date) => ({ date, page: '/page/home', leads: 0 })));
    page('/blog/post/nid-dat-preparation', NOW, { clicks: 1, impressions: 20, position: 8 });
    const r = buildWorkNext(db, input());
    expect(r.items[0]).toMatchObject({ id: 'tracking', goal: 'tracking', action: { type: 'check' } });
  });

  it('lists the biggest estimated wins first and respects the limit', () => {
    for (let i = 0; i < 20; i++) page(`/blog/post/p${String(i)}`, NOW, { clicks: 0.5, impressions: 10 + i, position: 8 });
    const r = buildWorkNext(db, input({ rules: { ...DEFAULT_WORK_RULES, maxItems: 5 } }));
    expect(r.items).toHaveLength(5);
    const scores = r.items.map((x) => x.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('says plainly when nothing stands out', () => {
    const r = buildWorkNext(db, input());
    expect(r).toMatchObject({ enough: true, items: [] });
    expect(r.why).toContain('Nothing stands out');
  });
});
