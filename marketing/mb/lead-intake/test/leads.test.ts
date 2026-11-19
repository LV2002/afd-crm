import { createVerify, generateKeyPairSync } from 'node:crypto';
import { FakeClock, GoogleAuth } from '@mb/platform';
import { describe, expect, it } from 'vitest';
import { GoogleSheetsLeads, parseLeads } from '../src/index.ts';

const HEADER = ['Received', 'Submission ID', 'Name', 'Phone', 'Email', 'Exam', 'City', 'Page', 'Form', 'Page URL', 'utm_source', 'Action', 'CRM status'];
const row = (over: Record<string, string>): string[] => HEADER.map((h) => over[h] ?? '');

describe('parseLeads', () => {
  it('reads columns by name, newest first, and ignores empty rows', () => {
    const rows = [HEADER, row({ Received: '2026-10-14T04:00:00.000Z', Name: 'Asha', Phone: '9895484652', Exam: 'NIFT', Page: '/page/nift-coaching', Form: 'Book a demo', Action: 'inline-1', 'CRM status': 'sent' }), row({}), row({ Received: '2026-10-14T05:00:00.000Z', Name: 'Ravi', 'CRM status': 'queued' })];
    const leads = parseLeads(rows);
    expect(leads.map((l) => l.name)).toEqual(['Ravi', 'Asha']);
    expect(leads[1]).toMatchObject({ exam: 'NIFT', page: '/page/nift-coaching', form: 'Book a demo', action: 'inline-1', crmStatus: 'sent' });
    expect(leads[1]?.receivedAt?.toISOString()).toBe('2026-10-14T04:00:00.000Z');
  });

  it('survives a moved column and an empty sheet', () => {
    expect(parseLeads([['Name', 'Phone'], ['Asha', '98']])[0]).toMatchObject({ name: 'Asha', phone: '98', email: '' });
    expect(parseLeads([])).toEqual([]);
  });
});

describe('GoogleSheetsLeads', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyFile = JSON.stringify({ client_email: 'engine@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });

  function make(sheetStatus = 200) {
    const calls: { url: string; init?: { headers?: Record<string, string>; body?: string } }[] = [];
    const fetch = (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
      calls.push({ url, ...(init === undefined ? {} : { init }) });
      if (url.includes('oauth2')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 'tok', expires_in: 3600 }) });
      return Promise.resolve({ ok: sheetStatus === 200, status: sheetStatus, json: () => Promise.resolve({ values: [HEADER, row({ Name: 'Asha', 'CRM status': 'sent' })] }) });
    };
    return { calls, reader: new GoogleSheetsLeads({ sheetId: 'SHEET', auth: new GoogleAuth({ readKeyFile: () => keyFile, fetch, clock: new FakeClock('2026-10-14T06:00:00Z') }), fetch }) };
  }

  it('signs a read-only token request with the service account key, then reads the sheet', async () => {
    const { calls, reader } = make();
    const r = await reader.list();
    expect(r.ok && r.value[0]?.name).toBe('Asha');
    const assertion = /assertion=(.+)$/.exec(calls[0]?.init?.body ?? '')?.[1] ?? '';
    const [h, c, s] = assertion.split('.');
    expect(createVerify('RSA-SHA256').update(`${h ?? ''}.${c ?? ''}`).verify(publicKey, Buffer.from(s ?? '', 'base64url'))).toBe(true);
    const claims = JSON.parse(Buffer.from(c ?? '', 'base64url').toString()) as { scope: string; iss: string };
    expect(claims.scope).toContain('spreadsheets.readonly');
    expect(claims.iss).toBe('engine@x.iam.gserviceaccount.com');
    expect(calls[1]?.url).toContain('/spreadsheets/SHEET/values/');
    expect(calls[1]?.init?.headers?.['Authorization']).toBe('Bearer tok');
  });

  it('reuses the access token on the next read', async () => {
    const { calls, reader } = make();
    await reader.list();
    await reader.list();
    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(1);
  });

  it('explains a refused sheet, a missing sheet and a bad key in plain words', async () => {
    const refused = await make(403).reader.list();
    expect(!refused.ok && refused.error).toContain('engine@x.iam.gserviceaccount.com');
    const missing = await make(404).reader.list();
    expect(!missing.ok && missing.error).toContain('Enquiries');
    const bad = await new GoogleSheetsLeads({ sheetId: 's', auth: new GoogleAuth({ readKeyFile: () => 'not json', fetch: () => Promise.reject(new Error('never')), clock: new FakeClock('2026-10-14T06:00:00Z') }), fetch: () => Promise.reject(new Error('never')) }).list();
    expect(!bad.ok && bad.error).toContain('key file');
  });
});
