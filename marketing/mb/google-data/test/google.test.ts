import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeClock, type FetchFn } from '@mb/platform';
import { buildReport, openGoogleData, pageWindow, reportMarkdown } from '../src/index.ts';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const keyPath = join(mkdtempSync(join(tmpdir(), 'gk-')), 'key.json');
writeFileSync(keyPath, JSON.stringify({ client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://oauth2.googleapis.com/token' }));
const config = { gscSite: 'sc-domain:afdindia.com', ga4PropertyId: '123' };
const clock = new FakeClock(new Date('2026-11-19T10:00:00Z'));

// A fake Google: answers the token call, Search Console and Analytics.
function fakeGoogle(opts: { gscStatus?: number } = {}): FetchFn {
  return async (url, init) => {
    const body = init?.body ?? '';
    if (url.includes('oauth2')) return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) };
    if (url.includes('searchconsole')) {
      if (opts.gscStatus !== undefined) return { ok: false, status: opts.gscStatus, json: async () => ({}) };
      const dims = (JSON.parse(body) as { dimensions: string[] }).dimensions.join(',');
      const rows = dims === 'date,page' ? [{ keys: ['2026-11-10', 'https://afdindia.com/blog/post/a'], clicks: 5, impressions: 100, position: 8 }]
        : dims === 'date,query' ? [{ keys: ['2026-11-10', 'nid dat eligibility'], clicks: 0, impressions: 120, position: 11 }]
        : [{ keys: ['https://afdindia.com/blog/post/a', 'nid dat eligibility'], clicks: 0, impressions: 120, position: 11 }, { keys: ['https://afdindia.com/blog/post/a', 'nid dat syllabus'], clicks: 4, impressions: 60, position: 3 }];
      return { ok: true, status: 200, json: async () => ({ rows }) };
    }
    const filtered = body.includes('generate_lead');
    const rows = filtered ? [{ dimensionValues: [{ value: '20261110' }, { value: '/blog/post/a' }], metricValues: [{ value: '2' }] }]
      : [{ dimensionValues: [{ value: '20261110' }, { value: body.includes('sessionSourceMedium') ? 'google / organic' : '/blog/post/a' }], metricValues: [{ value: '30' }, { value: '25' }, { value: '20' }] }];
    return { ok: true, status: 200, json: async () => ({ rows }) };
  };
}

describe('google data', () => {
  it('syncs Search Console and Analytics into the store and reports rework candidates and enquiries', async () => {
    const g = openGoogleData({ keyPath, config, dbPath: ':memory:', fetch: fakeGoogle(), clock });
    const s = await g.sync();
    expect(s.errors).toEqual([]);
    expect(s.rows).toBeGreaterThan(0);
    const r = buildReport(g.store, '2026-11-19');
    expect(r.dashboard.hasData).toBe(true);
    expect(r.reworkCandidates.map((x) => x.query)).toEqual(['nid dat eligibility']);
    expect(r.seenNotClicked.map((x) => x.query)).toEqual(['nid dat eligibility']);
    expect(r.leadsByPage).toEqual([{ page: '/blog/post/a', leads: 2 }]);
    expect(reportMarkdown(r)).toContain('nid dat eligibility on /blog/post/a');
  });

  it('says what to do when Search Console refuses, naming the account to add', async () => {
    const g = openGoogleData({ keyPath, config, dbPath: ':memory:', fetch: fakeGoogle({ gscStatus: 403 }), clock });
    const s = await g.sync();
    expect(s.errors.some((e) => /svc@example\.iam\.gserviceaccount\.com/.test(e.message))).toBe(true);
  });

  it('reports a missing key file as a clear error, not a crash', async () => {
    const g = openGoogleData({ keyPath: '/nonexistent/key.json', config, dbPath: ':memory:', fetch: fakeGoogle(), clock });
    const s = await g.sync();
    expect(s.errors.length).toBeGreaterThan(0);
    expect(s.errors[0]?.message).toMatch(/key file/i);
  });

  it('judges a page honestly: too early, too little data, or against the site movement', async () => {
    const g = openGoogleData({ keyPath, config, dbPath: ':memory:', fetch: fakeGoogle(), clock });
    await g.sync();
    expect(pageWindow(g.store, '/blog/post/a', '2026-11-15', '2026-11-19').verdict).toMatch(/Too early/);
    expect(pageWindow(g.store, '/blog/post/zzz', '2026-09-01', '2026-11-19').verdict).toMatch(/Too little data/);
  });
});
