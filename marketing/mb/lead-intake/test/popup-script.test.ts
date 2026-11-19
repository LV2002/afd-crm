import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { FORM_SCRIPT, footerScript, type PopupFeedItem } from '../src/index.ts';

const ENDPOINT = 'https://script.google.com/macros/s/ABC/exec';
const item = (over: Partial<PopupFeedItem & { imageUrl: string }> = {}): PopupFeedItem & { imageUrl?: string } => ({
  id: 'nift-offer', v: 'v1', title: 'Free NIFT mock test', body: 'Try a real paper.', button: 'Book my seat', thanks: 'Thank you. We will call you.',
  fields: [{ key: 'exam', label: 'Exam', required: true, options: ['NID', 'NIFT'] }, { key: 'email', label: 'Email', required: false }], delaySeconds: 2, repeatDays: 3, pages: { mode: 'all', paths: [] }, ...over,
});

async function open(popups: unknown[], path = '/page/nift-coaching', store: Record<string, string> = {}) {
  vi.useFakeTimers();
  const dom = new JSDOM(`<body><p>x</p><script data-afd-endpoint="${ENDPOINT}"></script></body>`, { url: `https://afdindia.com${path}`, runScripts: 'outside-only' });
  const posts: URLSearchParams[] = [];
  const fetchMock = vi.fn((_url: string, init?: { method?: string; body: URLSearchParams }) => {
    if (init?.method === 'POST') { posts.push(init.body); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, facts: {}, popups }) });
  });
  Object.assign(dom.window, { fetch: fetchMock, AFD_ENDPOINT: ENDPOINT, dataLayer: [] });
  for (const [k, v] of Object.entries(store)) dom.window.localStorage.setItem(k, v);
  dom.window.eval(footerScript(FORM_SCRIPT));
  await vi.advanceTimersByTimeAsync(5000);
  return { d: dom.window.document, posts, dom };
}
const shown = (d: Document): boolean => d.querySelector('.afd-pop-ov') !== null;

describe('the pop-up on the website', () => {
  it('shows a pop-up that is on, after its delay, with the owner’s words and fields', async () => {
    const { d } = await open([item({ imageUrl: 'https://lh3.googleusercontent.com/d/x=w900' })]);
    expect(shown(d)).toBe(true);
    expect(d.querySelector('.afd-pop-h')?.textContent).toBe('Free NIFT mock test');
    expect(d.querySelector<HTMLImageElement>('.afd-pop-img')?.src).toContain('lh3.googleusercontent.com');
    expect([...d.querySelectorAll('.afd-pop [name]')].map((n) => n.getAttribute('name')).filter((n) => ['name', 'phone', 'exam', 'email'].includes(n ?? ''))).toEqual(['name', 'phone', 'exam', 'email']);
    expect(d.querySelector<HTMLSelectElement>('.afd-pop select')?.required).toBe(true);
  });

  it('shows nothing when there is no pop-up in the feed, which is what switching one off does', async () => {
    expect(shown((await open([])).d)).toBe(false);
  });

  it('waits for its delay', async () => {
    vi.useFakeTimers();
    const r = await open([item({ delaySeconds: 60 })]);
    expect(shown(r.d)).toBe(false);
  });

  it('is never shown on /publisher or /user pages', async () => {
    expect(shown((await open([item()], '/publisher/course')).d)).toBe(false);
    expect(shown((await open([item()], '/user/login')).d)).toBe(false);
  });

  it('follows the pages the owner chose', async () => {
    const only = item({ pages: { mode: 'only', paths: ['/page/nift-coaching'] } });
    expect(shown((await open([only], '/page/nift-coaching')).d)).toBe(true);
    expect(shown((await open([only], '/page/nid-coaching')).d)).toBe(false);
    const except = item({ pages: { mode: 'except', paths: ['/blog'] } });
    expect(shown((await open([except], '/blog/post/x')).d)).toBe(false);
    expect(shown((await open([except], '/page/x')).d)).toBe(true);
  });

  it('does not come back for the days chosen after it was closed, and does after that', async () => {
    const first = await open([item()]);
    first.d.querySelector<HTMLButtonElement>('.afd-pop-x')?.click();
    expect(shown(first.d) && !first.d.querySelector<HTMLElement>('.afd-pop-ov')?.hidden).toBe(false);
    const stored = first.dom.window.localStorage.getItem('afd_pop_nift-offer') ?? '';
    expect(shown((await open([item()], '/page/x', { 'afd_pop_nift-offer': stored })).d)).toBe(false);
    const old = JSON.stringify({ ...(JSON.parse(stored) as object), closedAt: Date.now() - 4 * 86400000 });
    expect(shown((await open([item()], '/page/x', { 'afd_pop_nift-offer': old })).d)).toBe(true);
  });

  it('does not show to someone who has already sent their details', async () => {
    expect(shown((await open([item()], '/page/x', { afd_seen: JSON.stringify({ lead: 1, exams: {}, visits: 1 }) })).d)).toBe(false);
  });

  it('sends the lead through the signed route with its own form name', async () => {
    const { d, posts, dom } = await open([item()]);
    const set = (n: string, v: string): void => { const i = d.querySelector<HTMLInputElement>(`.afd-pop [name=${n}]`); if (i === null) throw new Error(n); i.value = v; };
    set('name', 'Asha'); set('phone', '9895484652'); set('exam', 'NIFT');
    d.querySelector('.afd-pop form')?.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(50);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.get('form')).toBe('popup-nift-offer');
    expect(posts[0]?.get('exam')).toBe('NIFT');
    expect(d.querySelector<HTMLElement>('.afd-pop [data-afd-thanks]')?.hidden).toBe(false);
    expect(dom.window.localStorage.getItem('afd_pop_nift-offer')).toContain('"done":true');
  });
});
