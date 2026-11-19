import { createHmac } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppsScriptFactsPublisher, FORM_SCRIPT, buildLivePayload, formScriptTag, liveFactTag, signPublish } from '../src/index.ts';
import { FakeClock } from '@mb/platform';
import { makeGoogleStub, type GoogleStub } from './google-stub.ts';

let g: GoogleStub;
const NOW = new Date('2026-10-26T05:00:00Z');
const facts = [
  { id: 'nift-2027-reg-close', label: 'NIFT registration closes', value: '16 November 2026', date: '2026-11-16', usable: true },
  { id: 'nift-2027-seats', label: 'NIFT seats', value: 'not announced', usable: false },
];
const signed = (secret = 'feed-secret', at = Date.now(), tamper = false): Record<string, unknown> => {
  const payloadJson = JSON.stringify(buildLivePayload(facts, NOW));
  return { _afd_publish: 'facts', timestamp: at, payloadJson: tamper ? payloadJson.replace('16 November', '17 November') : payloadJson, signature: createHmac('sha256', secret).update(`${String(at)}.${payloadJson}`).digest('hex') };
};

beforeEach(() => {
  g = makeGoogleStub(new URL('../apps-script', import.meta.url).pathname);
  g.props['FACTS_SECRET'] = 'feed-secret';
});

describe('the payload', () => {
  it('holds confirmed facts only', () => {
    const p = buildLivePayload(facts, NOW);
    expect(Object.keys(p.facts)).toEqual(['nift-2027-reg-close']);
    expect(p.facts['nift-2027-reg-close']).toEqual({ label: 'NIFT registration closes', value: '16 November 2026', date: '2026-11-16' });
  });
  it('writes the tag for a hand-written page, escaped', () => {
    expect(liveFactTag('a-b', 'Rs <1> & "2"')).toBe('<span data-afd-fact="a-b">Rs &#60;1&#62; &#38; &#34;2&#34;</span>');
  });
});

describe('the Apps Script feed', () => {
  it('stores a signed publish in the Live facts tab and serves it on a GET', () => {
    expect(g.postJson(signed())).toEqual({ ok: true, count: 1 });
    expect(g.sheets.get('Live facts')?.rows[1]?.slice(0, 4)).toEqual(['nift-2027-reg-close', 'NIFT registration closes', '16 November 2026', '2026-11-16']);
    expect(g.get({ facts: '1' })).toMatchObject({ ok: true, version: 1, facts: { 'nift-2027-reg-close': { value: '16 November 2026', date: '2026-11-16' } } });
  });

  it('a later publish replaces the old facts, and the change shows at once despite the cache', () => {
    g.postJson(signed());
    g.get({ facts: '1' });
    const payloadJson = JSON.stringify(buildLivePayload([{ ...facts[0]!, value: '18 November 2026' }], NOW)); // eslint-disable-line @typescript-eslint/no-non-null-assertion -- fixture has two facts
    const at = Date.now();
    g.postJson({ _afd_publish: 'facts', timestamp: at, payloadJson, signature: signPublish('feed-secret', at, payloadJson) });
    expect(g.get({ facts: '1' })).toMatchObject({ facts: { 'nift-2027-reg-close': { value: '18 November 2026' } } });
    expect(g.sheets.get('Live facts')?.rows).toHaveLength(2);
  });

  it('refuses a wrong key, a changed body, an old request, and a script with no key set', () => {
    expect(g.postJson(signed('wrong'))).toMatchObject({ ok: false, error: 'the signature does not match' });
    expect(g.postJson(signed('feed-secret', Date.now(), true))).toMatchObject({ ok: false, error: 'the signature does not match' });
    expect(g.postJson(signed('feed-secret', Date.now() - 11 * 60_000))).toMatchObject({ ok: false, error: 'the request is too old, or has no time' });
    g.props['FACTS_SECRET'] = null;
    expect(g.postJson(signed())).toMatchObject({ ok: false });
    expect(g.sheets.get('Live facts')).toBeUndefined();
  });

  it('never mistakes a lead for a publish, and a publish for a lead', () => {
    g.post({ name: 'Asha Nair', phone: '9895484652', submission_id: 's1' });
    expect(g.sheets.get('Live facts')).toBeUndefined();
    g.postJson(signed());
    expect(g.sheets.get('Enquiries')?.rows).toHaveLength(2);
  });

  it('serves an empty feed before anything has been published', () => {
    expect(g.get({ facts: '1' })).toMatchObject({ ok: true, facts: {} });
    expect(g.get({})).toMatchObject({ ok: true, service: 'afdindia enquiry intake' });
  });
});

describe('the publisher adapter', () => {
  const clock = new FakeClock('2026-10-26T05:00:00Z');
  const payload = buildLivePayload(facts, NOW);
  it('sends a body the script accepts: the same signature the script recomputes', async () => {
    let sent: { timestamp: number; payloadJson: string; signature: string; _afd_publish: string } | undefined;
    const fetchFn: typeof fetch = (_url, init) => { sent = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as typeof sent; return Promise.resolve(Response.json({ ok: true, count: 1 })); };
    const r = await new AppsScriptFactsPublisher({ endpoint: 'https://script.google.com/x/exec', secret: 'feed-secret', fetch: fetchFn, clock }).publish(payload);
    expect(r).toEqual({ ok: true, value: { count: 1 } });
    expect(sent?._afd_publish).toBe('facts');
    expect(sent?.signature).toBe(signPublish('feed-secret', clock.now().getTime(), sent?.payloadJson ?? ''));
  });
  it('explains what is missing instead of calling out, and never echoes the key', async () => {
    const never: typeof fetch = () => { throw new Error('should not be called'); };
    expect(await new AppsScriptFactsPublisher({ endpoint: '', secret: 'k', fetch: never, clock }).publish(payload)).toMatchObject({ ok: false });
    expect(await new AppsScriptFactsPublisher({ endpoint: 'https://x/exec', secret: '', fetch: never, clock }).publish(payload)).toMatchObject({ ok: false });
    const leaky: typeof fetch = () => Promise.resolve(Response.json({ ok: false, error: 'bad key feed-secret' }));
    const r = await new AppsScriptFactsPublisher({ endpoint: 'https://x/exec', secret: 'feed-secret', fetch: leaky, clock }).publish(payload);
    expect(r.ok ? '' : r.error).not.toContain('feed-secret');
  });
});

describe('the footer script on a page', () => {
  const run = (markup: string, feed: unknown, setup: (w: JSDOM['window']) => void = () => {}): { doc: Document; fetchMock: ReturnType<typeof vi.fn> } => {
    const dom = new JSDOM(`<body>${markup}</body>`, { url: 'https://afdindia.com/blog/post/x', runScripts: 'outside-only' });
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(feed) }));
    Object.assign(dom.window, { fetch: fetchMock, AFD_ENDPOINT: 'https://script.google.com/macros/s/ABC/exec' });
    setup(dom.window);
    dom.window.eval(FORM_SCRIPT);
    return { doc: dom.window.document, fetchMock };
  };
  const span = '<p>Closes <span data-afd-fact="nift-2027-reg-close">16 November 2026</span>.</p>';

  it('replaces each tagged figure with the value in the feed, on a page with no form at all', async () => {
    const { doc, fetchMock } = run(span, { ok: true, facts: { 'nift-2027-reg-close': { value: '18 November 2026' } } });
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.querySelector('[data-afd-fact]')?.textContent).toBe('18 November 2026');
    expect(fetchMock).toHaveBeenCalledWith('https://script.google.com/macros/s/ABC/exec?facts=1', { cache: 'no-store' });
  });

  it('leaves the printed value alone when the feed is down, wrong, or has no such fact', async () => {
    for (const feed of [{ ok: false }, { ok: true, facts: {} }, null]) {
      const { doc } = run(span, feed);
      await new Promise((r) => setTimeout(r, 0));
      expect(doc.querySelector('[data-afd-fact]')?.textContent).toBe('16 November 2026');
    }
  });

  it('never treats a value as markup', async () => {
    const { doc } = run(span, { ok: true, facts: { 'nift-2027-reg-close': { value: '<img src=x onerror=alert(1)>' } } });
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.querySelector('img')).toBeNull();
  });

  it('asks the feed nothing on a page with no tagged figures', () => {
    expect(run('<p>No figures</p>', { ok: true, facts: {} }).fetchMock).not.toHaveBeenCalled();
  });

  it('carries the address on the tag the owner pastes, so the page needs no form', () => {
    expect(formScriptTag('https://script.google.com/macros/s/ABC/exec')).toMatch(/^<script data-afd-endpoint="https:\/\/script\.google\.com\/macros\/s\/ABC\/exec">/);
    expect(formScriptTag()).toMatch(/^<script>/);
  });
});
