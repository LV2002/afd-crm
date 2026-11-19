import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeGoogleStub, type GoogleStub } from './google-stub.ts';

const good = {
  name: 'Asha Nair', phone: '98954 84652', email: 'asha@example.com', exam: 'NIFT', page: '/page/nift-coaching',
  form: 'Book a demo', page_url: 'https://afdindia.com/page/nift-coaching?utm_source=meta', utm_source: 'meta', submission_id: 's1', favourite: 'colour',
};

let g: GoogleStub;
const enquiries = (): unknown[][] => g.sheets.get('Enquiries')?.rows ?? [];
const queue = (): unknown[][] => g.sheets.get('CRM queue')?.rows ?? [];

beforeEach(() => {
  g = makeGoogleStub(new URL('../apps-script', import.meta.url).pathname);
});

describe('what the owner asked to see for every lead', () => {
  it('writes name, email, phone, exam, page and form to the sheet row', () => {
    expect(g.post(good)).toEqual({ ok: true });
    const header = enquiries()[0] ?? [];
    const row = enquiries()[1] ?? [];
    const at = (column: string): unknown => row[header.indexOf(column)];
    expect(at('Name')).toBe('Asha Nair');
    expect(at('Email')).toBe('asha@example.com');
    expect(at('Phone')).toBe('9895484652');
    expect(at('Exam')).toBe('NIFT');
    expect(at('Page')).toBe('/page/nift-coaching');
    expect(at('Form')).toBe('Book a demo');
    expect(at('utm_source')).toBe('meta');
    expect(String(at('All fields (JSON)'))).toContain('favourite');
    expect(g.sheets.get('Enquiries')?.formats.get('2:4')).toBe('@');
  });

  it('sends the same fields to the CRM, signed with the exact body', () => {
    g.post(good);
    const sent = g.fetches[0];
    expect(sent?.url).toBe('https://crm.example/api/webhooks/website');
    const body = JSON.parse(sent?.options.payload ?? '{}') as Record<string, string>;
    expect(body).toMatchObject({ name: 'Asha Nair', email: 'asha@example.com', phone: '9895484652', exam: 'NIFT', course: 'NIFT', page: '/page/nift-coaching', form: 'Book a demo', utm_source: 'meta', favourite: 'colour' });
    expect(body).not.toHaveProperty('gclid');
    expect(sent?.options.headers['X-AFD-Signature']).toBe(`sha256=${createHmac('sha256', 'k3y').update(sent?.options.payload ?? '').digest('hex')}`);
  });
});

describe('sheet first, CRM second, nothing lost', () => {
  it('ignores duplicates, bots and bad input', () => {
    g.post(good);
    expect(g.post(good)).toMatchObject({ duplicate: true });
    expect(g.post({ ...good, submission_id: 's2', company_website: 'x' })).toEqual({ ok: true });
    expect(g.post({ name: '', phone: '1' })).toMatchObject({ ok: false });
    expect(enquiries()).toHaveLength(2);
    expect(g.fetches).toHaveLength(1);
  });

  it('keeps the row, queues the lead while the CRM is down, and delivers it later', () => {
    g.crm.status = 500;
    g.post({ ...good, submission_id: 's3', phone: '9895484651' });
    expect(enquiries()[1]?.[19]).toBe('queued');
    expect(queue()).toHaveLength(2);
    g.crm.status = 200;
    g.call('retryCrmQueue');
    expect(queue()[1]?.[1]).toBe('sent');
  });

  it('lets the browser retry after a failed sheet write instead of calling it a duplicate', () => {
    g.call('setup');
    const sheet = g.sheets.get('Enquiries');
    if (!sheet) throw new Error('setup did not create the Enquiries sheet');
    sheet.failDataWrites = true;
    expect(g.post(good)).toMatchObject({ ok: false });
    expect(g.fetches).toHaveLength(0);
    sheet.failDataWrites = false;
    expect(g.post(good)).toEqual({ ok: true });
    expect(enquiries()).toHaveLength(2);
  });

  it('records a CRM refusal and does not retry it', () => {
    g.crm.status = 403;
    g.post(good);
    expect(enquiries()[1]?.[19]).toBe('rejected');
    expect(queue()).toHaveLength(0);
  });

  it('queues instead of failing when the signing key is not set yet', () => {
    g.props['CRM_SECRET'] = null;
    g.post(good);
    expect(enquiries()).toHaveLength(2);
    expect(queue()).toHaveLength(2);
  });

  it('turns a spreadsheet formula into plain text', () => {
    g.post({ ...good, name: '=HYPERLINK("x")' });
    expect(String(enquiries()[1]?.[2])).toMatch(/^'=/);
  });

  it('survives the CRM address being unreachable', () => {
    g.crm.status = 'throw';
    expect(g.post(good)).toEqual({ ok: true });
    expect(queue()).toHaveLength(2);
  });
});

describe('free resources behind a private link', () => {
  const FILE = 'F'.repeat(30);
  const setUp = (): void => {
    g.drive.set(FILE, { type: 'application/pdf', bytes: Buffer.from('%PDF-1.4 past paper') });
    // The owner's Resources tab: id, title, Drive link.
    g.post({ ...good, submission_id: 'warm', resource_id: 'warm-up' });
    const sheet = g.sheets.get('Resources');
    sheet?.rows.push(['nid-papers', 'NID past papers', `https://drive.google.com/file/d/${FILE}/view`]);
  };
  const paper = { ...good, resource_id: 'nid-papers' };
  const linkOf = (r: Record<string, unknown>): string => String(r['download']);

  it('stores the lead first and hands back a private link', () => {
    setUp();
    const r = g.post({ ...paper, submission_id: 'r1' });
    expect(r['ok']).toBe(true);
    expect(linkOf(r)).toMatch(/^https:\/\/script\.google\.com\/macros\/s\/ABC\/exec\?dl=[0-9a-f]{64}$/);
    expect(enquiries().some((row) => row.includes('Asha Nair'))).toBe(true);
    expect(g.fetches).toHaveLength(2);
  });

  it('opens the file from inside the page, without showing the Drive address', () => {
    setUp();
    const token = linkOf(g.post({ ...paper, submission_id: 'r2' })).split('dl=')[1] ?? '';
    const page = g.open({ dl: token });
    expect(page.title).toBe('NID past papers');
    expect(page.html).toContain(Buffer.from('%PDF-1.4 past paper').toString('base64'));
    expect(page.html).not.toContain(FILE);
  });

  it('stops working after three opens', () => {
    setUp();
    const token = linkOf(g.post({ ...paper, submission_id: 'r3' })).split('dl=')[1] ?? '';
    for (let i = 0; i < 3; i++) expect(g.open({ dl: token }).html).toContain('atob');
    expect(g.open({ dl: token }).html).toContain('This link has been used');
  });

  it('refuses a made-up token', () => {
    setUp();
    expect(g.open({ dl: 'nope' }).html).toContain('not valid');
  });

  it('still stores the lead, with no link, when the resource is not set up', () => {
    setUp();
    const r = g.post({ ...good, submission_id: 'r4', resource_id: 'unknown' });
    expect(r).toEqual({ ok: true });
    expect(enquiries().length).toBeGreaterThan(1);
  });

  it('gives no link to a form that asked for no resource', () => {
    expect(g.post(good)).toEqual({ ok: true });
  });
});

describe('a phone number is exactly ten digits', () => {
  it('stores a ten digit number with spaces or dashes taken out', () => {
    expect(g.post({ ...good, phone: '98954-84652', submission_id: 'p1' })).toEqual({ ok: true });
    const header = enquiries()[0] ?? [];
    expect((enquiries()[1] ?? [])[header.indexOf('Phone')]).toBe('9895484652');
  });
  it('refuses nine, eleven, twelve and thirteen digits, and +91 numbers sent straight to it', () => {
    for (const [i, phone] of ['989548465', '09895484652', '919895484652', '+91 98954 84652', '9895484652999'].entries()) {
      expect(g.post({ ...good, phone, submission_id: `bad${String(i)}` })).toMatchObject({ ok: false, error: 'name and a 10 digit phone number are needed' });
    }
    expect(enquiries()).toHaveLength(0);
  });
});
