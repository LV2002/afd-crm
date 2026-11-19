import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CTA_SCRIPT, CtaPlaybookSchema, FORM_SCRIPT, LeadFormsConfigSchema, OffersConfigSchema, planCtas, renderCtas, type CtaInput } from '../src/index.ts';

const read = (f: string): unknown => JSON.parse(readFileSync(new URL(`../../../config/${f}`, import.meta.url), 'utf8')) as unknown;
const playbook = CtaPlaybookSchema.parse(read('cta-playbook.json'));
const offers = OffersConfigSchema.parse(read('offers.json'));
const forms = LeadFormsConfigSchema.parse({ ...(read('lead-forms.json') as object), endpoint: 'https://script.google.com/macros/s/ABC/exec' });
const facts = new Map([['nift-2027-reg-close', { value: '16 November 2026', date: '2026-11-16', usable: true }]]);
const offersWithDeadline = { ...offers, deadlineFacts: [{ exam: 'NIFT', factId: 'nift-2027-reg-close' }] };
const input = (over: Partial<CtaInput> = {}): CtaInput => ({ title: 'NIFT dates and how to apply', exam: 'NIFT', intent: 'dates', sections: 5, offers: offersWithDeadline, ctx: { forms, today: '2026-10-27', facts }, playbook, ...over });
const plan = (over: Partial<CtaInput> = {}) => { const p = planCtas(input(over)); if (p === undefined) throw new Error('no plan'); return p; };

describe('planCtas: what each page asks for', () => {
  it('words the call to action for the kind of page and the exam', () => {
    const p = plan();
    expect(p.closing.headline).toBe('Never miss a NIFT deadline');
    expect(p.closing.offer.kind).toBe('career-call');
    expect(p.closing.form).toBe('full');
    expect(plan({ intent: 'papers', exam: 'NID' }).closing).toMatchObject({ headline: 'Practise with real NID papers', offer: { id: 'nid-question-bank' } });
    expect(plan({ intent: 'preparation' }).closing.offer.kind).toBe('demo-class');
  });

  it('says "design entrance" on a page about no particular exam, and falls back to the general wording', () => {
    const p = plan({ exam: undefined, intent: undefined });
    expect(p.closing.headline).toBe('Talk to a mentor about design entrance');
    expect(p.strip.deadline).toBeUndefined();
  });

  it('puts cards between sections: after the second, then every third, never after the last, at most the allowed number', () => {
    expect(plan({ sections: 2 }).inline).toEqual([]);
    expect(plan({ sections: 5 }).inline.map((x) => x.afterSection)).toEqual([2]);
    expect(plan({ sections: 9 }).inline.map((x) => x.afterSection)).toEqual([2, 5]);
    expect(plan({ sections: 30 }).inline).toHaveLength(2);
  });

  it('offers something different in the second card, so a long page does not repeat itself', () => {
    const [a, b] = plan({ sections: 9, intent: 'preparation' }).inline;
    expect(a?.item.offer.kind).toBe('demo-class');
    expect(b?.item.offer.kind).toBe('lead-magnet');
  });

  it('opens WhatsApp with the page already named, so the mentor sees what the reader was reading', () => {
    const url = new URL(plan().strip.whatsappUrl);
    expect(url.host).toBe('wa.me');
    expect(url.searchParams.get('text')).toBe('Hi, I am reading "NIFT dates and how to apply" on afdindia.com and have a question about NIFT.');
    expect(new URL(plan({ exam: undefined }).strip.whatsappUrl).searchParams.get('text')).toBe('Hi, I am reading "NIFT dates and how to apply" on afdindia.com and have a question.');
  });

  it('shows the deadline only while it is true, from a confirmed fact', () => {
    expect(plan().strip.deadline).toEqual({ factId: 'nift-2027-reg-close', value: '16 November 2026' });
    expect(plan({ ctx: { forms, today: '2026-11-17', facts } }).strip.deadline).toBeUndefined();
    expect(plan({ ctx: { forms, today: '2026-10-27', facts: new Map([['nift-2027-reg-close', { value: 'x', date: '2026-11-16', usable: false }]]) } }).strip.deadline).toBeUndefined();
  });

  it('can switch the corner card off, and plans nothing without offers', () => {
    expect(plan({ playbook: { ...playbook, slideIn: { ...playbook.slideIn, enabled: false } } }).slide).toBeUndefined();
    expect(planCtas(input({ offers: { offers: [], deadlineFacts: [] } }))).toBeUndefined();
  });

  it('needs a general wording in the playbook', () => {
    const rest = Object.fromEntries(Object.entries(playbook.intents).filter(([k]) => k !== 'general'));
    expect(CtaPlaybookSchema.safeParse({ ...playbook, intents: rest }).success).toBe(false);
  });

  it('has copy that never mentions money, promises a result, or uses a dash', () => {
    const all = JSON.stringify(playbook);
    expect(all).not.toMatch(/[—–]/);
    expect(all).not.toMatch(/\b(fees?|price|cost|discount|guarantee\w*)\b/i);
  });
});

describe('renderCtas: the blocks on the page', () => {
  const drawn = () => { const r = renderCtas(plan({ sections: 9 }), forms, '/blog/post/nift-dates'); if (!r.ok) throw new Error(r.error); return r.value; };

  it('marks every block so it can be tailored and measured, and every form with where it came from', () => {
    const d = drawn();
    expect(d.strip).toContain('data-afd-cta="strip"');
    expect(d.inline[0]?.html).toContain('data-afd-cta="inline-1"');
    expect(d.inline[0]?.html).toContain('name="placement" value="inline-1"');
    expect(d.closing).toContain('name="placement" value="closing"');
    expect(d.closing).toContain('name="offer" value="career-call"');
    expect(d.closing).toContain('name="cta_page" value="/blog/post/nift-dates"');
  });

  it('asks the short blocks only for a name and a number, and the closing form for more', () => {
    const d = drawn();
    expect(d.inline[0]?.html).not.toContain('name="email"');
    expect(d.inline[0]?.html).toContain('<input type="hidden" name="exam" value="NIFT">');
    expect(d.closing).toContain('name="email"');
  });

  it('keeps the deadline live and the sheet and corner card hidden until the script opens them', () => {
    const d = drawn();
    expect(d.strip).toContain('data-afd-count="nift-2027-reg-close"');
    expect(d.strip).toContain('<span data-afd-fact="nift-2027-reg-close">16 November 2026</span>');
    expect(d.sheet).toMatch(/^<div class="afd-sheet"[^>]* hidden /);
    expect(d.slide).toMatch(/^<aside class="afd-slide"[^>]*data-afd-after-scroll="55"[^>]*data-afd-after-seconds="40"[^>]*data-afd-hide-days="7" hidden>/);
  });

  it('adds only markup: no script, style, event handler or heading', () => {
    const d = drawn();
    for (const html of [d.strip, ...d.inline.map((x) => x.html), d.closing, d.sheet, d.slide]) expect(html).not.toMatch(/<script|<style|\sstyle=|\son[a-z]+=|<h[1-6]|javascript:/i);
  });

  it('refuses to draw without the lead script address', () => {
    expect(renderCtas(plan(), { ...forms, endpoint: '' }, '/x')).toMatchObject({ ok: false });
  });
});

describe('in the browser', () => {
  const run = (markup: string, setup: (w: JSDOM['window']) => void = () => {}) => {
    const dom = new JSDOM(`<body><article id="afd-post" data-afd-exam="NIFT">${markup}</article></body>`, { url: 'https://afdindia.com/blog/post/x', runScripts: 'outside-only', pretendToBeVisual: true });
    Object.assign(dom.window, { fetch: vi.fn(() => Promise.resolve({ ok: true })), matchMedia: () => ({ matches: true }), dataLayer: [] });
    setup(dom.window);
    dom.window.eval(CTA_SCRIPT);
    return dom;
  };
  const d = renderCtas(plan({ sections: 9 }), forms, '/blog/post/x');
  if (!d.ok) throw new Error(d.error);
  const all = `${d.value.strip}${d.value.inline.map((x) => x.html).join('')}${d.value.closing}${d.value.sheet}${d.value.slide}<button type="button" data-afd-open="sheet">Call me back</button>`;
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('says the usual words to a first visit and gentler ones to someone who has been here before', () => {
    const first = run(all);
    expect(first.window.document.querySelector('[data-afd-cta=closing] .afd-cta-h')?.textContent).toBe('Never miss a NIFT deadline');
    const back = run(all, (w) => { w.localStorage.setItem('afd_seen', JSON.stringify({ visits: 2, exams: { NIFT: 2 }, lead: 0, hid: 0 })); });
    expect(back.window.document.querySelector('[data-afd-cta=closing] .afd-cta-h')?.textContent).toBe('Still thinking about NIFT?');
    expect(back.window.document.querySelector('[data-afd-cta=closing] button[type=submit]')?.textContent).toBe('Talk to a mentor');
    expect(back.window.document.querySelector('[data-afd-cta=strip] .afd-strip-t')?.textContent).toContain('Deadlines matter');
  });

  it('remembers the exam a visitor reads about, in their own browser only', () => {
    const dom = run(all);
    const memory = JSON.parse(dom.window.localStorage.getItem('afd_seen') ?? '{}') as { visits: number; exams: Record<string, number> };
    expect(memory.visits).toBe(1);
    expect(memory.exams['NIFT']).toBe(1);
    expect((dom.window.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('opens the call back sheet from the bar, and closes it again', () => {
    const dom = run(all);
    const sheet = dom.window.document.querySelector<HTMLElement>('[data-afd-cta=sheet]');
    dom.window.document.querySelector<HTMLElement>('[data-afd-open=sheet]')?.click();
    expect(sheet?.hidden).toBe(false);
    dom.window.document.querySelector<HTMLElement>('[data-afd-cta=sheet] [data-afd-close]')?.click();
    expect(sheet?.hidden).toBe(true);
  });

  it('shows the corner card once after the wait, on a computer, and not again after it is closed', () => {
    const dom = run(all);
    const slide = dom.window.document.querySelector<HTMLElement>('[data-afd-cta=slide]');
    expect(slide?.hidden).toBe(true);
    vi.advanceTimersByTime(41_000);
    expect(slide?.hidden).toBe(false);
    dom.window.document.querySelector<HTMLElement>('[data-afd-cta=slide] [data-afd-close]')?.click();
    expect(slide?.hidden).toBe(true);
    const later = run(all, (w) => { w.localStorage.setItem('afd_seen', JSON.stringify({ visits: 1, exams: {}, lead: 0, hid: Date.now() })); });
    vi.advanceTimersByTime(41_000);
    expect(later.window.document.querySelector<HTMLElement>('[data-afd-cta=slide]')?.hidden).toBe(true);
  });

  it('never shows the corner card on a phone', () => {
    const dom = run(all, (w) => { Object.assign(w, { matchMedia: () => ({ matches: false }) }); });
    vi.advanceTimersByTime(60_000);
    expect(dom.window.document.querySelector<HTMLElement>('[data-afd-cta=slide]')?.hidden).toBe(true);
  });

  it('stops asking once someone has sent their details', () => {
    const dom = run(all);
    vi.advanceTimersByTime(41_000);
    dom.window.document.dispatchEvent(new dom.window.CustomEvent('afd-lead'));
    expect(dom.window.document.querySelector<HTMLElement>('[data-afd-cta=slide]')?.hidden).toBe(true);
    expect(dom.window.document.querySelector<HTMLElement>('[data-afd-cta=sheet]')?.hidden).toBe(true);
    expect(JSON.parse(dom.window.localStorage.getItem('afd_seen') ?? '{}')).toMatchObject({ lead: expect.any(Number) as number });
  });

  it('tells Tag Manager which block was clicked, without sending anything else anywhere', () => {
    const dom = run(all);
    dom.window.document.querySelector<HTMLElement>('[data-afd-cta=strip] a[data-afd-act=whatsapp]')?.click();
    const sent = (dom.window as unknown as { dataLayer: { event: string; cta?: string; act?: string }[] }).dataLayer;
    expect(sent.find((e) => e.event === 'cta_click')).toMatchObject({ cta: 'strip', act: 'whatsapp' });
  });

  it('does nothing on a page that has none of it, and nothing under /publisher or /user', () => {
    const none = new JSDOM('<body><p>Plain</p></body>', { url: 'https://afdindia.com/page/x', runScripts: 'outside-only' });
    none.window.eval(CTA_SCRIPT);
    expect(none.window.localStorage.getItem('afd_seen')).toBeNull();
    const pub = new JSDOM(`<body>${all}</body>`, { url: 'https://afdindia.com/publisher/course', runScripts: 'outside-only' });
    pub.window.eval(CTA_SCRIPT);
    expect(pub.window.localStorage.getItem('afd_seen')).toBeNull();
  });
});

describe('the deadline countdown', () => {
  it('turns "on 16 November 2026" into "in 20 days" while it is close, and hides the chip once it has passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T05:00:00Z'));
    const markup = '<span class="afd-chip">Registration closes <span data-afd-count="nift-2027-reg-close">on <span data-afd-fact="nift-2027-reg-close">16 November 2026</span></span></span>';
    const run = async (feed: unknown) => {
      // The page has its own clock, which the fake timers do not touch; hand it the fake one so the day count does not depend on today's date.
      const dom = new JSDOM(`<body>${markup}</body>`, { url: 'https://afdindia.com/page/x', runScripts: 'outside-only' });
      Object.assign(dom.window, { Date, fetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(feed) })), AFD_ENDPOINT: 'https://script.google.com/macros/s/ABC/exec' });
      dom.window.eval(FORM_SCRIPT);
      await vi.advanceTimersByTimeAsync(5);
      return dom.window.document;
    };
    return Promise.resolve().then(async () => {
      const soon = await run({ ok: true, facts: { 'nift-2027-reg-close': { value: '16 November 2026', date: '2026-11-16' } } });
      expect(soon.querySelector('[data-afd-count]')?.textContent).toBe('in 20 days');
      const gone = await run({ ok: true, facts: { 'nift-2027-reg-close': { value: '16 November 2026', date: '2026-10-01' } } });
      expect(gone.querySelector<HTMLElement>('.afd-chip')?.hidden).toBe(true);
      vi.useRealTimers();
    });
  });
});
