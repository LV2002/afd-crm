import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppsScriptPopupsPublisher, PopupSchema, buildPopupPayload, imageInfo, imageProblem, signPublish, type Popup } from '../src/index.ts';
import { FakeClock } from '@mb/platform';
import { makeGoogleStub, type GoogleStub } from './google-stub.ts';

const NOW = new Date('2026-11-02T05:00:00Z');
const popup = (over: Partial<Popup> = {}): Popup => PopupSchema.parse({
  id: 'nift-offer', name: 'NIFT offer', enabled: true, title: 'Free NIFT mock test', body: 'Try a real paper this Sunday.', button: 'Book my seat', thanks: 'Thank you. We will call you.',
  fields: [{ key: 'exam', label: 'Exam', required: true }, { key: 'email', label: 'Email', required: false }], delaySeconds: 8, repeatDays: 3,
  pages: { mode: 'all', paths: [] }, updatedAt: NOW.toISOString(), ...over,
});

// A 600 x 300 PNG header and a 640 x 320 JPEG header: enough bytes for the size to be read.
const png = (w: number, h: number): Uint8Array => { const b = new Uint8Array(40); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); return b; };
const jpeg = (w: number, h: number): Uint8Array => Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe('what the website is sent', () => {
  it('holds only the pop-ups that are on', () => {
    const p = buildPopupPayload([popup(), popup({ id: 'old-one', enabled: false }), popup({ id: 'gone', archived: true })], ['NID'], new Map(), NOW);
    expect(p.popups.map((x) => x.id)).toEqual(['nift-offer']);
  });

  it('gives the exam and studying fields their choices', () => {
    const p = buildPopupPayload([popup({ fields: [{ key: 'exam', label: 'Exam', required: true }, { key: 'studying', label: 'Studying in', required: false }] })], ['NID', 'NIFT'], new Map(), NOW);
    expect(p.popups[0]?.fields[0]?.options).toEqual(['NID', 'NIFT']);
    expect(p.popups[0]?.fields[1]?.options).toContain('Class 12');
  });

  it('sends the picture with the pop-up that has one', () => {
    const withImage = popup({ image: { hash: 'abcdef0123456789', type: 'image/png', width: 600, height: 300 } });
    const p = buildPopupPayload([withImage], [], new Map([['nift-offer', { b64: 'QUJD' }]]), NOW);
    expect(p.popups[0]).toMatchObject({ imageB64: 'QUJD', imageType: 'image/png', imageHash: 'abcdef0123456789' });
  });
});

describe('the picture', () => {
  it('reads PNG and JPEG sizes from the header', () => {
    expect(imageInfo(png(600, 300))).toEqual({ type: 'image/png', width: 600, height: 300 });
    expect(imageInfo(jpeg(640, 320))).toEqual({ type: 'image/jpeg', width: 640, height: 320 });
  });
  it('accepts a landscape picture and refuses the rest, saying why', () => {
    expect(imageProblem(png(600, 300))).toBeUndefined();
    expect(imageProblem(png(400, 400))).toContain('landscape');
    expect(imageProblem(png(200, 100))).toContain('too small');
    expect(imageProblem(new Uint8Array(400_000))).toContain('under 300 KB');
    expect(imageProblem(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toContain('JPEG or PNG');
  });
});

describe('the Apps Script', () => {
  let g: GoogleStub;
  beforeEach(() => { g = makeGoogleStub(new URL('../apps-script', import.meta.url).pathname); g.props['FACTS_SECRET'] = 'feed-secret'; });
  const signed = (payload: unknown, secret = 'feed-secret'): Record<string, unknown> => { const at = Date.now(); const payloadJson = JSON.stringify(payload); return { _afd_publish: 'popups', timestamp: at, payloadJson, signature: signPublish(secret, at, payloadJson) }; };
  const payload = (items = buildPopupPayload([popup()], ['NID'], new Map(), NOW)) => items;

  it('serves a signed pop-up in the same feed as the facts', () => {
    expect(g.postJson(signed(payload()))).toEqual({ ok: true, count: 1 });
    const feed = g.get({ facts: '1' }) as { popups: { id: string; title: string; fields: { key: string }[] }[] };
    expect(feed.popups.map((x) => x.id)).toEqual(['nift-offer']);
    expect(feed.popups[0]?.title).toBe('Free NIFT mock test');
  });

  it('takes a pop-up off the website when it is no longer sent', () => {
    g.postJson(signed(payload()));
    g.postJson(signed(buildPopupPayload([popup({ enabled: false })], [], new Map(), NOW)));
    expect((g.get({ facts: '1' }) as { popups: unknown[] }).popups).toEqual([]);
  });

  it('refuses a request signed with another key or edited on the way', () => {
    expect(g.postJson(signed(payload(), 'wrong'))).toMatchObject({ ok: false, error: 'the signature does not match' });
    const s = signed(payload());
    expect(g.postJson({ ...s, payloadJson: String(s['payloadJson']).replace('Free NIFT', 'Free NID') })).toMatchObject({ ok: false });
  });

  it('saves the picture to Drive once and gives the website its address', () => {
    const withImage = popup({ image: { hash: 'abcdef0123456789', type: 'image/png', width: 600, height: 300 } });
    const p = buildPopupPayload([withImage], [], new Map([['nift-offer', { b64: Buffer.from('PNGDATA').toString('base64') }]]), NOW);
    g.postJson(signed(p));
    g.postJson(signed(p));
    expect(g.drive.size).toBe(1);
    const feed = g.get({ facts: '1' }) as { popups: { imageUrl: string }[] };
    expect(feed.popups[0]?.imageUrl).toMatch(/^https:\/\/lh3\.googleusercontent\.com\/d\/drive0+1=w900$/);
    expect(JSON.stringify(feed)).not.toContain('imageB64');
  });
});

describe('the publisher', () => {
  it('signs the request with the shared key and reports the count', async () => {
    let sent: { _afd_publish: string; timestamp: number; payloadJson: string; signature: string } | undefined;
    const fetchMock = vi.fn((_u: string, init: { body: string }) => { sent = JSON.parse(init.body) as typeof sent; return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true, count: 1 }) }); });
    const pub = new AppsScriptPopupsPublisher({ endpoint: 'https://script.google.com/x/exec', secret: 'feed-secret', fetch: fetchMock as unknown as typeof fetch, clock: new FakeClock(NOW.toISOString()) });
    expect(await pub.publish(buildPopupPayload([popup()], [], new Map(), NOW))).toEqual({ ok: true, value: { count: 1 } });
    expect(sent?._afd_publish).toBe('popups');
    expect(sent?.signature).toBe(signPublish('feed-secret', sent?.timestamp ?? 0, sent?.payloadJson ?? ''));
  });
  it('does not call out with no address or no key', async () => {
    const fetchMock = vi.fn();
    const none = new AppsScriptPopupsPublisher({ endpoint: '', secret: 'k', fetch: fetchMock, clock: new FakeClock(NOW.toISOString()) });
    expect((await none.publish({ version: 1, publishedAt: NOW.toISOString(), popups: [] })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
