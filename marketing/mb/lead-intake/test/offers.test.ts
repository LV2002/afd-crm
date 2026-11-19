import { checkAdditiveOnly } from '@mb/page-reader';
import { describe, expect, it } from 'vitest';
import { LeadFormsConfigSchema, OffersConfigSchema, inferExam, recommendOffers, renderOffer, renderLeadForm, type OfferContext } from '../src/index.ts';

const forms = LeadFormsConfigSchema.parse({ endpoint: 'https://script.google.com/macros/s/ABC/exec', centres: [{ id: 'kochi', name: 'Kochi', phone: '9895484652', whatsapp: '919895484652' }], primaryCentreId: 'kochi', exams: ['NIFT', 'NID', 'UCEED', 'CEED', 'NATA'] });
const config = OffersConfigSchema.parse({
  offers: [
    { id: 'demo-class', kind: 'demo-class', title: 'Try a free demo class', promise: 'Sit in on a real class and meet the mentors.', button: 'Book my demo', exams: [], deliverUrl: '' },
    { id: 'nid-bank', kind: 'lead-magnet', title: 'Free NID question bank', promise: 'Past papers with solutions for practice.', button: 'Send it', exams: ['NID'], deliverUrl: '/page/bank' },
    { id: 'self-study', kind: 'lead-magnet', title: 'Free self-study materials', promise: 'Study notes you can start with today.', button: 'Send them', exams: ['NIFT'], deliverUrl: '/page/self' },
    { id: 'career-call', kind: 'career-call', title: 'Free career call', promise: 'Talk to a mentor about your path.', button: 'Request a call', exams: [], deliverUrl: '' },
  ],
  deadlineFacts: [{ exam: 'UCEED', factId: 'uceed-close' }],
});
const ctx = (over: Partial<OfferContext> = {}): OfferContext => ({ forms, today: '2026-10-14', facts: new Map([['uceed-close', { value: '31 October 2026', date: '2026-10-31', usable: true }]]), ...over });
const offer = (id: string) => { const o = config.offers.find((x) => x.id === id); if (!o) throw new Error(id); return o; };

describe('renderOffer', () => {
  it('builds a block with a title, promise, form, offer marker and hidden fields', () => {
    const r = renderOffer(offer('nid-bank'), 'middle', 'NID', config, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('data-afd-offer="nid-bank"');
    expect(r.value).toContain('name="offer" value="nid-bank"');
    expect(r.value).toContain('name="resource" value="/page/bank"');
    expect(r.value).toContain('data-crm-form="Free resource: Free NID question bank"');
    expect(r.value).toContain('href="/page/bank"');
    expect(r.value).toContain('<option value="NID" selected>');
  });

  it('adds the registration deadline only while it is true, from a confirmed fact', () => {
    const line = (c: OfferContext) => { const r = renderOffer(offer('demo-class'), 'top', 'UCEED', config, c); return r.ok && /Registration closes on <span data-afd-fact="[a-z0-9-]+">31 October 2026<\/span>/.test(r.value); };
    expect(line(ctx())).toBe(true);
    expect(line(ctx({ today: '2026-11-01' }))).toBe(false);
    expect(line(ctx({ facts: new Map([['uceed-close', { value: '31 October 2026', date: '2026-10-31', usable: false }]]) }))).toBe(false);
    expect(line(ctx({ facts: new Map() }))).toBe(false);
  });

  it('has no heading, script, style or event handler, so it can only add to a page', () => {
    for (const id of ['demo-class', 'nid-bank', 'career-call']) {
      const r = renderOffer(offer(id), 'closing', 'NID', config, ctx());
      expect(r.ok && /<h[1-6]|<script|<style|\sstyle=|\son[a-z]+=/i.test(r.value)).toBe(false);
    }
  });

  it('escapes text from the settings file', () => {
    const evil = { ...offer('demo-class'), title: '<img src=x onerror=alert(1)>' };
    const r = renderOffer(evil, 'top', undefined, config, ctx());
    expect(r.ok && r.value.includes('<img src=x')).toBe(false);
  });
});

describe('recommendOffers and inferExam', () => {
  it('leads with a demo class on coaching pages and closes with the exam resource', () => {
    expect(recommendOffers({ kind: 'page', exam: 'NID' }, config)).toEqual([{ placement: 'top', offerId: 'demo-class' }, { placement: 'closing', offerId: 'nid-bank' }]);
  });

  it('offers the free resource first in a guide post and the demo class at the end', () => {
    expect(recommendOffers({ kind: 'blog', exam: 'NIFT' }, config)).toEqual([{ placement: 'middle', offerId: 'self-study' }, { placement: 'closing', offerId: 'demo-class' }]);
  });

  it('falls back sensibly when no resource matches the exam', () => {
    expect(recommendOffers({ kind: 'blog', exam: undefined }, config)[0]).toMatchObject({ placement: 'middle' });
  });

  it('reads the exam from an address or title', () => {
    expect(inferExam('/page/uceed-coaching')).toBe('UCEED');
    expect(inferExam('/page/ceed-exam')).toBe('CEED');
    expect(inferExam('/blog/post/nid-dat-mains')).toBe('NID');
    expect(inferExam('NATA Aptitude')).toBe('NATA');
    expect(inferExam('/page/contact')).toBeUndefined();
  });
});

describe('the form still works on its own', () => {
  it('keeps the default thanks and button', () => {
    const r = renderLeadForm({ config: forms, label: 'x', formId: 'f' });
    expect(r.ok && r.value).toContain('Request a call back');
  });
});

describe('adding an offer to a page is invisible to search engines', () => {
  const page = '<html><head><title>NID Coaching</title><meta name="description" content="d"></head><body><h1>NID Coaching</h1><p>Real text of the page.</p><h2>Why us</h2><p>More text.</p></body></html>';
  const withOffer = (blockHtml: string): string => page.replace('<h2>Why us</h2>', `${blockHtml}<h2>Why us</h2>`);
  const block = (): string => { const r = renderOffer(offer('demo-class'), 'top', 'NID', config, ctx()); if (!r.ok) throw new Error(r.error); return r.value; };

  it('passes when only our block was added', () => {
    expect(checkAdditiveOnly(page, withOffer(block()))).toEqual({ ok: true, value: undefined });
  });

  it('fails when a heading, the text, the title or the structured data changes', () => {
    const problems = (after: string): string[] => { const r = checkAdditiveOnly(page, after); return r.ok ? [] : r.error; };
    expect(problems(withOffer(block()).replace('Why us', 'Why choose us'))).toEqual(expect.arrayContaining(['a heading changed, appeared or disappeared', 'the page text changed']));
    expect(problems(withOffer(block()).replace('<title>NID Coaching</title>', '<title>New</title>'))).toContain('the title changed');
    expect(problems(withOffer(block()).replace('</head>', '<script type="application/ld+json">{}</script></head>'))).toContain('the structured data changed');
  });

  it('fails when a block smuggles in a heading or a script', () => {
    const heading = withOffer('<div data-afd-offer="x"><h2>Join now</h2></div>');
    const script = withOffer('<div data-afd-offer="x"><script>1</script></div>');
    expect(checkAdditiveOnly(page, heading).ok).toBe(false);
    expect(checkAdditiveOnly(page, script).ok).toBe(false);
  });
});

describe('offers that hand out a private file', () => {
  const forms = LeadFormsConfigSchema.parse({ endpoint: 'https://script.google.com/macros/s/ABC/exec', centres: [{ id: 'kochi', name: 'Kochi', phone: '9895484652', whatsapp: '919895484652' }], primaryCentreId: 'kochi', exams: ['NID', 'NATA'] });
  const base = { kind: 'lead-magnet' as const, promise: 'Practise with real papers.', exams: [], deliverUrl: '' };
  const config = OffersConfigSchema.parse({
    offers: [{ ...base, id: 'a', title: 'First free pack', button: 'Send me the first', resourceId: 'first-pack' }, { ...base, id: 'b', title: 'Second free pack', button: 'Send me the second' }, { ...base, id: 'c', title: 'Third pack', button: 'Send me the third', look: 'paper' }],
    deadlineFacts: [],
  });
  const ctx = { forms, facts: new Map(), today: '2026-11-01' };
  const draw = (id: string): string => { const o = config.offers.find((x) => x.id === id); const r = o === undefined ? undefined : renderOffer(o, 'middle', 'NID', config, ctx); if (r?.ok !== true) throw new Error('render'); return r.value; };

  it('asks for name, phone and a required email, and names the file to hand out', () => {
    const h = draw('a');
    expect(h).toContain('name="resource_id" value="first-pack"');
    expect(h).toMatch(/name="email"[^>]*required/);
    expect(h).toContain('data-afd-open-label');
  });

  it('keeps the email optional and sends no file name when the offer has no private file', () => {
    const h = draw('b');
    expect(h).not.toContain('resource_id');
    expect(h).not.toMatch(/name="email"[^>]*required/);
  });

  it('gives neighbouring offers different looks unless one is chosen', () => {
    const looks = ['a', 'b', 'c'].map((id) => /afd-look-(\w+)/.exec(draw(id))?.[1]);
    expect(looks).toEqual(['red', 'black', 'paper']);
  });

  it('labels each with what it is, for a big tag above the title', () => {
    expect(draw('a')).toContain('data-afd-kicker="Free download"');
  });
});

describe('the scholarship test offer', () => {
  const forms = LeadFormsConfigSchema.parse({ endpoint: 'https://script.google.com/macros/s/ABC/exec', centres: [{ id: 'kochi', name: 'Kochi', phone: '9895484652', whatsapp: '919895484652' }], primaryCentreId: 'kochi', exams: ['NID'] });
  const config = OffersConfigSchema.parse({ offers: [{ id: 'afdsat', kind: 'scholarship-test', title: 'Take the AFDSAT', promise: 'get upto 90% scholarship', button: 'Apply for AFDSAT', exams: [], deliverUrl: '' }], deadlineFacts: [] });
  const html = (() => { const o = config.offers[0]; const r = o === undefined ? undefined : renderOffer(o, 'middle', undefined, config, { forms, facts: new Map(), today: '2026-11-02' }); if (r?.ok !== true) throw new Error('render'); return r.value; })();

  it('asks for name, phone and a required email, and nothing about an exam', () => {
    expect(html).toContain('name="name"');
    expect(html).toContain('name="phone"');
    expect(html).toMatch(/name="email"[^>]*required/);
    expect(html).not.toContain('name="exam"');
  });
  it('is named and labelled so each application is recognised in the sheet and the CRM', () => {
    expect(html).toContain('name="formType" value="Scholarship (AFDSAT)"');
    expect(html).toContain('data-crm-form="Scholarship test: Take the AFDSAT"');
    expect(html).toContain('data-afd-kicker="Scholarship test"');
    expect(html).toContain('Apply for AFDSAT');
  });
});
