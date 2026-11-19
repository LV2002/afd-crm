import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { formScriptTag, stickyContact } from '../src/index.ts';

const ENDPOINT = 'https://script.google.com/macros/s/ABC/exec';
const TWO = { centres: [{ id: 'kochi', name: 'Kochi', phone: '9895484652', whatsapp: '919895484652' }, { id: 'kannur', name: 'Kannur', phone: '9895484651', whatsapp: '919895484651' }], exams: ['NID', 'NIFT'] };

function open(path: string, forms = TWO, endpoint = ENDPOINT) {
  const tag = formScriptTag(endpoint, undefined, stickyContact(forms));
  const dom = new JSDOM(`<body><p>Hello</p>${tag}</body>`, { url: `https://afdindia.com${path}`, runScripts: 'dangerously' });
  return dom;
}
const fetchFor = (dom: JSDOM) => { const f = vi.fn(() => Promise.resolve({ ok: true })); Object.assign(dom.window, { fetch: f }); return f; };

describe('the bar at the bottom of every page', () => {
  it('shows Call us, WhatsApp and Enquiry now on an ordinary page', () => {
    const d = open('/page/nid-coaching').window.document;
    const labels = [...d.querySelectorAll('.afd-sbar .afd-sb-b')].map((b) => b.textContent);
    expect(labels).toEqual(['Call us', 'WhatsApp', 'Enquiry now']);
    expect(d.documentElement.className).toContain('afd-has-sticky');
  });

  it('is not there on /publisher or /user pages', () => {
    for (const p of ['/publisher/x', '/user/login', '/user']) expect(open(p).window.document.querySelector('.afd-sbar')).toBeNull();
  });

  it('lists both centres under Call us and WhatsApp, with real links', () => {
    const d = open('/page/x').window.document;
    const links = [...d.querySelectorAll('.afd-sb-m a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['tel:+919895484652', 'tel:+919895484651', 'https://wa.me/919895484652', 'https://wa.me/919895484651']);
  });

  it('is a single plain link when there is only one centre', () => {
    const d = open('/page/x', { centres: TWO.centres.slice(0, 1), exams: [] }).window.document;
    expect(d.querySelector('.afd-sb-i a.afd-sb-b')?.getAttribute('href')).toBe('tel:+919895484652');
    expect(d.querySelector('.afd-sb-m')).toBeNull();
  });

  it('has no Enquiry now button when there is no lead address', () => {
    const d = open('/page/x', TWO, '').window.document;
    expect([...d.querySelectorAll('.afd-sbar .afd-sb-b')].map((b) => b.textContent)).toEqual(['Call us', 'WhatsApp']);
  });

  it('opens the enquiry form and sends the lead through the signed route', async () => {
    const dom = open('/page/nid-coaching');
    const fetchMock = fetchFor(dom);
    const d = dom.window.document;
    d.querySelector<HTMLButtonElement>('.afd-sb-b.go')?.click();
    expect(d.querySelector<HTMLElement>('.afd-sb-sheet')?.hidden).toBe(false);
    const set = (n: string, v: string): void => { const i = d.querySelector<HTMLInputElement>(`.afd-sb-sheet [name=${n}]`); if (i === null) throw new Error(n); i.value = v; };
    set('name', 'Asha'); set('phone', '9895484652'); set('exam', 'NID');
    d.querySelector('.afd-sb-sheet form')?.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await vi.waitFor(() => { expect(d.querySelector<HTMLElement>('.afd-sb-sheet [data-afd-thanks]')?.hidden).toBe(false); });
    const post = (fetchMock.mock.calls as unknown as [string, { method?: string; body: URLSearchParams }][]).find((c) => c[1].method === 'POST');
    expect(post?.[0]).toBe(ENDPOINT);
    expect(post?.[1].body.get('form')).toBe('sticky-bar');
    expect(post?.[1].body.get('page')).toBe('/page/nid-coaching');
    expect(post?.[1].body.get('exam')).toBe('NID');
  });
});

describe('call and WhatsApp clicks for Google Tag Manager', () => {
  const clicks = (html: string, path = '/page/x'): { layer: Record<string, unknown>[]; click: (sel: string) => void } => {
    const dom = new JSDOM(`<body>${html}${formScriptTag(ENDPOINT, undefined, stickyContact(TWO))}</body>`, { url: `https://afdindia.com${path}`, runScripts: 'dangerously' });
    const layer: Record<string, unknown>[] = [];
    (dom.window as unknown as { dataLayer: unknown[] }).dataLayer = layer;
    return { layer, click: (sel) => { dom.window.document.querySelector<HTMLElement>(sel)?.click(); } };
  };

  it('reports a tap on a phone link, including one already on the page', () => {
    const t = clicks('<a id="old" href="tel:+919895484652">Call</a>');
    t.click('#old');
    expect(t.layer).toContainEqual({ event: 'call_click', link_url: 'tel:+919895484652', placement: 'page', page_path: '/page/x' });
  });

  it('reports WhatsApp links of both kinds and ignores other links', () => {
    const t = clicks('<a id="a" href="https://wa.me/919895484652">a</a><a id="b" href="https://api.whatsapp.com/send?phone=1">b</a><a id="c" href="/page/other">c</a>');
    t.click('#a'); t.click('#b'); t.click('#c');
    expect(t.layer.filter((e) => e['event'] === 'whatsapp_click')).toHaveLength(2);
    expect(t.layer.some((e) => e['link_url'] === '/page/other')).toBe(false);
  });

  it('says a tap came from the bar at the bottom', () => {
    const t = clicks('<p>x</p>');
    t.click('.afd-sb-m a');
    expect(t.layer.some((e) => e['event'] === 'call_click' && e['placement'] === 'sticky-bar')).toBe(true);
  });
});

describe('the Enquiry now form has its colours', () => {
  it('sets the colour variables on the form as well as on the bar, because the form sits outside the bar', () => {
    const css = new JSDOM(`<body>${formScriptTag(ENDPOINT, undefined, stickyContact(TWO))}</body>`, { url: 'https://afdindia.com/page/x', runScripts: 'dangerously' }).window.document.querySelector('style[data-afd-sbar]')?.textContent ?? '';
    expect(css).toMatch(/\.afd-sbar,\.afd-sb-sheet\{--p:[^}]*--k:[^}]*--w:/);
    expect(css).toContain('.afd-sb-sheet input');
  });
  it('puts the form in the page next to the bar, not inside it', () => {
    const d = open('/page/x').window.document;
    expect(d.querySelector('.afd-sbar .afd-sb-sheet')).toBeNull();
    expect(d.querySelector('body > .afd-sb-sheet')).not.toBeNull();
  });
});

describe('the footer script wherever it is pasted', () => {
  const tag = (): string => formScriptTag(ENDPOINT, undefined, stickyContact(TWO));
  const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 30); });

  it('works when pasted in the header box by mistake, because it waits for the page', async () => {
    const dom = new JSDOM(`<!doctype html><html><head>${tag()}</head><body><p>page</p></body></html>`, { url: 'https://afdindia.com/page/x', runScripts: 'dangerously' });
    await settle();
    expect(dom.window.document.querySelectorAll('.afd-sbar')).toHaveLength(1);
    expect(dom.window.document.querySelector('style[data-afd-sbar]')).not.toBeNull();
  });

  it('stops a second copy on the same page from doing everything twice', async () => {
    const dom = new JSDOM(`<body><p>page</p>${tag()}${tag()}</body>`, { url: 'https://afdindia.com/page/x', runScripts: 'dangerously' });
    await settle();
    expect(dom.window.document.querySelectorAll('.afd-sbar')).toHaveLength(1);
    expect(dom.window.document.querySelectorAll('style[data-afd-sbar]')).toHaveLength(1);
  });

  it('replaces the bar an older copy left, so the new look and colours win', async () => {
    const old = '<div class="afd-sbar">old bar</div><div class="afd-sb-sheet">old form</div><style data-afd-sbar="v1">.afd-sbar{}</style>';
    const dom = new JSDOM(`<body><p>page</p>${old}${tag()}</body>`, { url: 'https://afdindia.com/page/x', runScripts: 'dangerously' });
    await settle();
    const d = dom.window.document;
    expect(d.querySelectorAll('.afd-sbar')).toHaveLength(1);
    expect(d.querySelector('.afd-sbar')?.getAttribute('data-v')).toBe('2');
    expect(d.body.textContent).not.toContain('old bar');
    expect(d.querySelectorAll('style[data-afd-sbar]')).toHaveLength(1);
  });
});
