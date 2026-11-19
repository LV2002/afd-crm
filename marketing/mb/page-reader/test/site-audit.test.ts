import { FakeClock, migrate, openDb, ok, platformMigrations, type Result } from '@mb/platform';
import { describe, expect, it } from 'vitest';
import { GentleReader, SqlitePageStore, compareAudits, extractPageFacts, auditPage, pageReaderMigrations, runSiteAudit, sitemapUrls, type AuditContext, type FetchedPage, type PageSource } from '../src/index.ts';
import { badPage, goodPage } from './pages.ts';

class FakeSite implements PageSource {
  readonly seen: string[] = [];
  pages: Record<string, { status: number; html: string }> = {};
  getPage(url: string): Promise<Result<FetchedPage, string>> {
    this.seen.push(url);
    const p = this.pages[new URL(url).pathname] ?? { status: 404, html: '' };
    return Promise.resolve(ok({ url, ...p }));
  }
  getText(): Promise<Result<{ status: number; text: string }, string>> {
    return Promise.resolve(ok({ status: 200, text: 'User-agent: *\nDisallow: /secret' }));
  }
}

const setup = (pages: Record<string, { status: number; html: string }>) => {
  const site = new FakeSite();
  site.pages = pages;
  const clock = new FakeClock('2026-10-14T06:00:00Z');
  const db = openDb(':memory:');
  migrate(db, [...platformMigrations, ...pageReaderMigrations], clock);
  const store = new SqlitePageStore(db);
  const reader = new GentleReader(site, { origin: 'https://afdindia.com', agentName: 'AFDIndiaEngine', delayMs: 0, sleep: () => Promise.resolve() });
  const notes: string[] = [];
  return { site, store, reader, clock, notes, deps: { reader, store, clock, progress: (_p: number, n: string) => { notes.push(n); } } };
};

describe('sitemapUrls', () => {
  it('lists each page once, on the main host, whatever host the sitemap used', () => {
    const xml = '<urlset><url><loc>https://www.afdindia.com/page/a</loc></url><url><loc>https://afdindia.com/page/a</loc></url><url><loc> https://www.afdindia.com/blog/post/b </loc></url></urlset>';
    expect(sitemapUrls(xml, 'https://afdindia.com')).toEqual(['https://afdindia.com/page/a', 'https://afdindia.com/blog/post/b']);
  });
});

describe('runSiteAudit', () => {
  it('reads each page, keeps every reading, and reports progress', async () => {
    const { deps, store, notes } = setup({ '/page/a': { status: 200, html: goodPage }, '/page/b': { status: 200, html: badPage } });
    const summary = await runSiteAudit(deps, ['https://afdindia.com/page/a', 'https://afdindia.com/page/b']);
    expect(summary).toMatchObject({ read: 2, failed: [], stopped: undefined });
    expect(store.latestAll().map((s) => s.path)).toEqual(['/page/a', '/page/b']);
    expect(notes[0]).toContain('page 1 of 2');
    await runSiteAudit(deps, ['https://afdindia.com/page/a']);
    expect(store.history('/page/a')).toHaveLength(2);
    expect(store.latestAll()).toHaveLength(2);
  });

  it('stops at the first block, keeps what it already read, and says so', async () => {
    const { deps, store, site } = setup({ '/page/a': { status: 200, html: goodPage }, '/page/b': { status: 403, html: '' }, '/page/c': { status: 200, html: goodPage } });
    const summary = await runSiteAudit(deps, ['https://afdindia.com/page/a', 'https://afdindia.com/page/b', 'https://afdindia.com/page/c']);
    expect(summary.read).toBe(1);
    expect(summary.stopped).toMatchObject({ kind: 'blocked', status: 403 });
    expect(site.seen).not.toContain('https://afdindia.com/page/c');
    expect(store.latestAll()).toHaveLength(1);
  });

  it('skips pages robots.txt forbids and records pages that fail to load', async () => {
    const { deps } = setup({ '/page/a': { status: 200, html: goodPage } });
    const summary = await runSiteAudit(deps, ['https://afdindia.com/secret/x', 'https://afdindia.com/page/a']);
    expect(summary).toMatchObject({ read: 1, skippedByRobots: 1 });
  });
});

describe('compareAudits and the form script check', () => {
  const ctx: AuditContext = { cycleYear: 2027, knownPhones: ['9895484652', '9895484651'], templateImages: new Set(['/logo.png']), officialDomains: ['admissions.nid.edu'] };
  const audit = (html: string) => auditPage(extractPageFacts(html, 'https://afdindia.com/page/x', 200), ctx);

  it('shows what a rework fixed, what is still wrong and what it broke', () => {
    const fixed = compareAudits(audit(badPage), audit(goodPage));
    expect(fixed.fixed.map((f) => f.id)).toEqual(expect.arrayContaining(['h1', 'schema-valid', 'phone-numbers']));
    expect(fixed.newProblems).toEqual([]);
    const broken = compareAudits(audit(goodPage), audit(badPage));
    expect(broken.fixed).toEqual([]);
    expect(broken.newProblems.map((f) => f.id)).toEqual(expect.arrayContaining(['title', 'h1']));
    expect(compareAudits(audit(badPage), audit(badPage)).stillBad.map((f) => f.id)).toContain('title');
  });

  it('flags a page with a form but without our footer script, and accepts one that has it', () => {
    expect(audit(goodPage).find((f) => f.id === 'lead-script')?.status).toBe('ok');
    const without = goodPage.replace(/<script>sessionStorage[^<]*<\/script>/, '');
    expect(audit(without).find((f) => f.id === 'lead-script')?.status).toBe('warn');
  });
});
