import { contentCheck, type Brief, type CopyRules, type Draft } from '@mb/content-quality';
import type { Fact } from '@mb/facts';
import { readFileSync } from 'node:fs';
import { CentresConfigSchema, CtaPlaybookSchema, LeadFormsConfigSchema, OffersConfigSchema } from '@mb/lead-intake';
import { describe, expect, it } from 'vitest';
import { DESIGN_VERSION, articleLd, bodyProblems, buildKnorishPackage, pasteSteps, verifyPaste, type BuildContext, type PageSeen } from '../src/index.ts';

const rules: CopyRules = { bannedPhrases: ['guaranteed'], stockOpeners: [], bannedWords: ['fee', 'fees', 'price'], bannedSymbols: ['₹'] };
const brief: Brief = {
  primaryKeyword: 'NID DAT', secondaryKeywords: ['studio test'], searchIntent: 'informational', contentGoal: 'education', funnelStage: 'middle',
  audience: 'Class 12 students', cta: { text: 'Book a free demo class' },
  readerAnswers: { who: 'A Class 12 student', outcome: 'Knows the plan', whyUs: 'Experienced mentors', proof: 'Alumni results', nextStep: 'Book a demo' },
};
const filler = (n: number): string => Array.from({ length: n }, () => 'Practise every day with a timer and review each attempt with a mentor.').join(' ');
const answer = (lead: string): string => `${lead} Start with simple drawing tasks, then add timed practice, and ask a mentor to review your work every week so you see what to fix next.`;
const body = [
  '# NID DAT preparation: a plan that works',
  `Many students ask where to begin with NID DAT. The Prelims are on {{fact:nid-2027-dat-prelims-date}}. ${filler(2)}`,
  '## Key takeaways', '- Start early and practise often',
  '## How do you prepare for NID DAT?', answer('Preparation for NID DAT works best when you build the habit first.'),
  '## What does the studio test check?', answer('The studio test checks how you observe, think and make something.'),
  '## A weekly routine', filler(6), filler(6), filler(6), filler(6),
  '{{form:Book a demo}}',
  '## Next step', `${filler(2)} Book a free demo class and we will plan your first month with you.`,
].join('\n\n');
const draft: Draft = { seoTitle: 'NID DAT preparation: a simple weekly plan', metaDescription: 'A clear weekly plan for NID DAT preparation, with timed practice, mentor review and a free demo class to start.', slug: 'nid-dat-preparation', body, brief };

const fact = (over: Partial<Fact> = {}): Fact => ({ id: 'nid-2027-dat-prelims-date', exam: 'NID', label: 'Prelims date', value: 'Sunday 20 December 2026', source: 'handbook', status: 'owner_verified', ...over });
const ctx = (facts: Fact[] = [fact()]): BuildContext => ({
  facts: new Map(facts.map((f) => [f.id, f])), rules,
  forms: LeadFormsConfigSchema.parse({ endpoint: 'https://script.google.com/macros/s/ABC/exec', centres: [{ id: 'kochi', name: 'Kochi', phone: '9895484652', whatsapp: '919895484652' }], primaryCentreId: 'kochi', exams: ['NIFT', 'NID'] }),
  now: new Date('2026-10-14T06:00:00Z'), author: 'Julie James', siteName: 'afdindia', siteUrl: 'https://afdindia.com',
});
const req = (d: Draft = draft, kind: 'blog' | 'page' = 'blog', path = '/blog/post/nid-dat-preparation') => ({ draft: d, check: contentCheck(draft, rules), kind, path });

describe('buildKnorishPackage', () => {
  it('has a good draft to start from', () => {
    expect(contentCheck(draft, rules).blocking).toEqual([]);
  });

  it('produces the six pieces, with facts filled in and the form and footer script in place', () => {
    const r = buildKnorishPackage(ctx(), req());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.metaTitle).toBe(draft.seoTitle);
    expect(r.value.metaKeywords).toBe('NID DAT, studio test');
    expect(r.value.pageBody).toContain('Sunday 20 December 2026');
    expect(r.value.pageBody).toContain('<span data-afd-fact="nid-2027-dat-prelims-date">Sunday 20 December 2026</span>');
    expect(r.value.pageBody).not.toContain('{{');
    expect(r.value.pageBody).toContain('data-endpoint="https://script.google.com/macros/s/ABC/exec"');
    expect(r.value.pageBody).toContain('data-crm-form="Book a demo"');
    expect(r.value.pageBody).not.toMatch(/<script|<style/);
    expect(r.value.footerCode).toMatch(/^<script data-afd-endpoint="https:\/\/script\.google\.com\/macros\/s\/ABC\/exec"[^>]*>.*location\.pathname/s);
    expect(r.value.headerCode).toContain('"@type":"Article"');
    expect(r.value.headerCode).toContain('"@type":"FAQPage"');
    expect((r.value.headerCode.match(/"@type":"Question"/g) ?? []).length).toBe(2);
    expect(r.value.headerCode).toContain('2026-10-14T06:00:00.000Z');
  });

  it('keeps every date and figure live: tagged in the body, plain text in the meta tags and the FAQ markup', () => {
    const r = buildKnorishPackage(ctx(), req());
    if (!r.ok) throw new Error('package not built');
    expect(r.value.pageBody).not.toMatch(/Sunday 20 December 2026(?!<\/span>)/);
    expect(r.value.headerCode).not.toContain('data-afd-fact');
    expect(r.value.metaDescription).not.toContain('<span');
  });

  it('adds no Article markup to an ordinary page', () => {
    const r = buildKnorishPackage(ctx(), req(draft, 'page', '/page/nid-dat-prelims'));
    expect(r.ok && r.value.headerCode.includes('"Article"')).toBe(false);
  });

  it('refuses a draft that was never checked, failed its check, or was edited afterwards', () => {
    const edited = { ...draft, body: `${body}\n\nOne more line.` };
    expect(buildKnorishPackage(ctx(), { ...req(), draft: edited }).ok).toBe(false);
    const failing = { ...draft, body: `${body}\n\nguaranteed` };
    expect(buildKnorishPackage(ctx(), { draft: failing, check: contentCheck(failing, rules), kind: 'blog', path: '/blog/post/x' }).ok).toBe(false);
  });

  it('refuses an unknown fact or one the owner has not verified', () => {
    expect(buildKnorishPackage(ctx([]), req())).toEqual({ ok: false, error: ['unknown fact "nid-2027-dat-prelims-date"'] });
    expect(buildKnorishPackage(ctx([fact({ status: 'secondary' })]), req())).toMatchObject({ ok: false, error: [expect.stringContaining('not verified')] });
  });

  it('never touches /publisher or /user', () => {
    expect(buildKnorishPackage(ctx(), req(draft, 'page', '/publisher/x')).ok).toBe(false);
    expect(buildKnorishPackage(ctx(), req(draft, 'page', '/user')).ok).toBe(false);
  });

  it('refuses scripts, event handlers and images without alt text smuggled into the markdown', () => {
    for (const bad of ['<script>alert(1)</script>', '<p onclick="x()">hi</p>', '![](/a.jpg)', '<iframe src="x"></iframe>']) {
      const d = { ...draft, body: `${body}\n\n${bad}` };
      const r = buildKnorishPackage(ctx(), { draft: d, check: contentCheck(d, rules), kind: 'blog', path: '/blog/post/x' });
      expect(r.ok, bad).toBe(false);
    }
  });
});

describe('articleLd', () => {
  it('cannot close its own script tag', () => {
    const out = articleLd({ headline: '</script><b>x', description: 'd', author: 'a', siteName: 's', siteUrl: 'https://x', path: '/p', publishedAt: new Date(0), modifiedAt: new Date(0) });
    expect(out.match(/<\/script>/g)).toHaveLength(1);
  });
});

describe('pasteSteps and verifyPaste', () => {
  const built = (() => { const r = buildKnorishPackage(ctx(), req()); if (!r.ok) throw new Error(r.error.join()); return r.value; })();

  it('lists the six pieces in paste order and skips an empty one', () => {
    expect(pasteSteps(built).map((s) => s.label)).toEqual(['Meta title', 'Meta description', 'Meta keywords', 'Header code', 'Page body', 'Footer code']);
    expect(pasteSteps({ ...built, metaKeywords: '' })).toHaveLength(5);
    expect(pasteSteps(built)[4]?.number).toBe(5);
  });

  const seenOk: PageSeen = { title: built.metaTitle, metaDescription: built.metaDescription, metaKeywords: built.metaKeywords, leadScript: true, jsonLdTypes: ['Article', 'FAQPage'], offerIds: [], bodyText: 'Home Blog NID NID DAT preparation: a plan that works Many students ask where to begin with NID DAT. The Prelims are on Sunday 20 December 2026. More text follows here.', designVersion: DESIGN_VERSION };

  it('passes when the page matches what was sent', () => {
    expect(verifyPaste(built, seenOk).every((c) => c.ok)).toBe(true);
  });

  it('names exactly what was missed', () => {
    const missed = verifyPaste(built, { ...seenOk, title: 'Old title', leadScript: false, jsonLdTypes: [], bodyText: 'something else entirely' });
    expect(missed.filter((c) => !c.ok).map((c) => c.label)).toEqual(['Meta title', 'Header code', 'Page body', 'Footer code']);
  });
});

describe('verifyPaste for an offer block patch', () => {
  const patch = { metaTitle: '', metaDescription: '', metaKeywords: '', headerCode: '', pageBody: '<div data-afd-offer="demo-class">x</div>', footerCode: '' };
  const seen: PageSeen = { title: 'Anything', metaDescription: 'Anything', metaKeywords: '', leadScript: false, jsonLdTypes: [], bodyText: 'unrelated', offerIds: [], designVersion: '' };

  it('checks that the offer block is on the page, and ignores pieces that were not part of the change', () => {
    expect(verifyPaste(patch, seen).filter((c) => !c.ok).map((c) => c.label)).toEqual(['Page body']);
    expect(verifyPaste(patch, { ...seen, offerIds: ['demo-class'] }).every((c) => c.ok)).toBe(true);
  });
});

describe('offers inside a draft', () => {
  const offers = OffersConfigSchema.parse({
    offers: [{ id: 'demo-class', kind: 'demo-class', title: 'Try a free demo class', promise: 'Sit in on a real class and meet the mentors.', button: 'Book my demo', exams: [], deliverUrl: '' }],
    deadlineFacts: [{ exam: 'NID', factId: 'nid-2027-dat-prelims-date' }],
  });
  const withOffers = (): BuildContext => ({ ...ctx(), offers: { config: offers, exam: 'NID', ctx: { forms: ctx().forms, today: '2026-10-14', facts: new Map([['nid-2027-dat-prelims-date', { value: 'Sunday 20 December 2026', date: '2026-12-20', usable: true }]]) } } });
  const draftWith = (token: string): Draft => ({ ...draft, body: body.replace('{{form:Book a demo}}', token) });
  const built = (d: Draft, c: BuildContext) => buildKnorishPackage(c, { draft: d, check: contentCheck(d, rules), kind: 'blog', path: '/blog/post/nid-dat-preparation' });

  it('turns an offer line into the offer block at the chosen place', () => {
    const r = built(draftWith('{{offer:demo-class@top}}'), withOffers());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pageBody).toContain('data-afd-offer="demo-class"');
    expect(r.value.pageBody).toContain('data-afd-placement="top"');
    expect(r.value.pageBody).toMatch(/Registration closes on <span data-afd-fact="[a-z0-9-]+">Sunday 20 December 2026<\/span>/);
  });

  it('refuses an offer that is not in the settings', () => {
    expect(built(draftWith('{{offer:nope}}'), withOffers())).toEqual({ ok: false, error: ['unknown offer "nope"'] });
    expect(built(draftWith('{{offer:demo-class}}'), ctx()).ok).toBe(false);
  });
});

describe('the card beside the article', () => {
  const offers = OffersConfigSchema.parse({
    offers: [
      { id: 'demo-class', kind: 'demo-class', title: 'Try a free demo class', promise: 'Sit in on a real class and meet the mentors.', button: 'Book my demo', exams: [], deliverUrl: '' },
      { id: 'nid-bank', kind: 'lead-magnet', title: 'Free NID question bank', promise: 'Past papers, solved step by step.', button: 'Send me the question bank', exams: ['NID'], deliverUrl: '/page/nid-bank' },
    ],
    deadlineFacts: [],
  });
  const withOffers = (): BuildContext => ({
    ...ctx([fact(), fact({ id: 'nid-2027-apply-close', label: 'Applications close', value: '30 November 2026', date: '2026-11-30' }), fact({ id: 'nid-2027-old', label: 'Old date', value: '1 March 2026', date: '2026-03-01' }), fact({ id: 'nid-2027-fee-date', label: 'Fee payment date', value: '1 December 2026', date: '2026-12-01' })]),
    offers: { config: offers, exam: 'NID', ctx: { forms: ctx().forms, today: '2026-10-14', facts: new Map() } },
  });
  const built = (kind: 'blog' | 'page', path: string) => buildKnorishPackage(withOffers(), { draft, check: contentCheck(draft, rules), kind, path });

  it('offers a blog reader the exam\'s free resource beside the text, in a small form that opens on a button', () => {
    const r = built('blog', '/blog/post/nid-dat-preparation');
    if (!r.ok) throw new Error(r.error.join());
    expect(r.value.pageBody).toMatch(/<aside class="ap-side">.*data-afd-offer="nid-bank" data-afd-placement="rail".*<details class="afd-drop"><summary>Send me the question bank<\/summary>/s);
    expect(r.value.pageBody).toContain('class="afd-lead compact"');
  });

  it('leads a page with the demo class instead', () => {
    const r = built('page', '/page/nid-dat-prelims');
    if (!r.ok) throw new Error(r.error.join());
    expect(r.value.pageBody).toMatch(/data-afd-offer="demo-class" data-afd-placement="rail"/);
  });

  it('lists the exam\'s next dates as live tags: nothing past, nothing about money', () => {
    const r = built('blog', '/blog/post/nid-dat-preparation');
    if (!r.ok) throw new Error(r.error.join());
    const dates = r.value.pageBody.match(/<div class="ap-kd">.*?<\/div>/s)?.[0] ?? '';
    expect(dates).toContain('<span data-afd-fact="nid-2027-apply-close">30 November 2026</span>');
    expect(dates).not.toContain('Old date');
    expect(dates).not.toContain('Fee payment');
  });

  it('keeps a call and WhatsApp bar for small screens, and still carries no script or style in the body', () => {
    const r = built('blog', '/blog/post/nid-dat-preparation');
    if (!r.ok) throw new Error(r.error.join());
    expect(r.value.pageBody).toContain('<div class="ap-bar">');
    expect(r.value.pageBody).not.toMatch(/<script|<style/);
  });
});

describe('tailored calls to action in a built page', () => {
  const playbook = CtaPlaybookSchema.parse(JSON.parse(readFileSync(new URL('../../../config/cta-playbook.json', import.meta.url), 'utf8')) as unknown);
  const offers = OffersConfigSchema.parse({
    offers: [
      { id: 'demo-class', kind: 'demo-class', title: 'Try a free demo class', promise: 'Sit in on a real class and meet the mentors.', button: 'Book my demo', exams: [], deliverUrl: '' },
      { id: 'career-call', kind: 'career-call', title: 'Free career call', promise: 'Talk to a mentor about your path.', button: 'Request a call', exams: [], deliverUrl: '' },
      { id: 'nid-bank', kind: 'lead-magnet', title: 'Free NID question bank', promise: 'Past papers, solved step by step.', button: 'Send me the question bank', exams: ['NID'], deliverUrl: '/page/nid-bank' },
    ],
    deadlineFacts: [{ exam: 'NID', factId: 'nid-2027-dat-prelims-date' }],
  });
  const withCtas = (cta = playbook): BuildContext => ({ ...ctx(), cta, offers: { config: offers, exam: 'NID', ctx: { forms: ctx().forms, today: '2026-10-14', facts: new Map([['nid-2027-dat-prelims-date', { value: 'Sunday 20 December 2026', date: '2026-12-20', usable: true }]]) } } });
  const built = (c: BuildContext) => { const r = buildKnorishPackage(c, req()); if (!r.ok) throw new Error(r.error.join()); return r.value.pageBody; };

  it('puts a line under the title, a card between sections, a closing form, a sheet, a corner card and a phone button', () => {
    const page = built(withCtas());
    expect(page).toContain('data-afd-exam="NID"');
    expect(page).toMatch(/<header>.*data-afd-cta="strip".*<\/header>/s);
    expect(page).toContain('data-afd-cta="inline-1"');
    expect(page).toMatch(/data-afd-cta="closing".*<section class="ap-author|data-afd-cta="closing"/s);
    expect(page).toContain('data-afd-cta="sheet"');
    expect(page).toContain('data-afd-cta="slide"');
    expect(page).toContain('data-afd-open="sheet"');
    expect(page).not.toContain('Talk to a mentor before you decide');
  });

  it('keeps the card between two sections of the article, not before the first or after the last', () => {
    const page = built(withCtas());
    const at = page.indexOf('data-afd-cta="inline-1"');
    expect(at).toBeGreaterThan(page.indexOf('How do you prepare for NID DAT?'));
    expect(at).toBeLessThan(page.indexOf('data-afd-cta="closing"'));
  });

  it('falls back to the plain closing panel when no playbook is given', () => {
    const plain: BuildContext = { ...withCtas(), cta: undefined } as unknown as BuildContext;
    const page = built(plain);
    expect(page).not.toContain('data-afd-cta=');
    expect(page).toContain('Talk to a mentor before you decide');
  });

  it('still adds no script or style to the page body', () => {
    expect(built(withCtas())).not.toMatch(/<script|<style|\sstyle=|\son[a-z]+=/i);
  });
});

describe('local pages', () => {
  const local: Draft = { ...draft, brief: { ...brief, geo: {
    key: 'nid:idukki', titleHint: 'NID Coaching in Idukki', tier: 'district', place: 'Idukki', path: '/page/nid-coaching-in-idukki', angle: 'a', neighbours: ['Ernakulam'], noNearbyCentre: false, parentPath: '/page/nid-coaching-in-kerala',
    centres: [{ name: 'Kochi', district: 'Ernakulam', relation: 'next-door' }],
    links: [{ title: 'NID coaching in Kerala', path: '/page/nid-coaching-in-kerala' }, { title: 'NID coaching in India', path: '/page/nid-coaching-in-india' }, { title: 'NID coaching in Ernakulam', path: '/page/nid-coaching-in-ernakulam' }],
  } } };
  const built = () => { const r = buildKnorishPackage(ctx(), { draft: local, check: contentCheck(local, rules), kind: 'page', path: '/page/nid-coaching-in-idukki', topic: 'NID' }); if (!r.ok) throw new Error(r.error.join()); return r.value; };

  it('adds the trail from the home page down to the page, as markup and as breadcrumb data', () => {
    const b = built();
    expect(b.pageBody).toContain('<a href="https://afdindia.com/page/nid-coaching-in-india">NID coaching in India</a> &rsaquo; <a href="https://afdindia.com/page/nid-coaching-in-kerala">NID coaching in Kerala</a> &rsaquo; NID');
    const ld = JSON.parse((/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"BreadcrumbList".*?\})<\/script>/s.exec(b.headerCode) ?? [])[1] ?? '{}') as { itemListElement: { position: number; name: string; item: string }[] };
    expect(ld.itemListElement.map((x) => x.name)).toEqual(['Home', 'NID coaching in India', 'NID coaching in Kerala', draft.seoTitle]);
    expect(ld.itemListElement.map((x) => x.position)).toEqual([1, 2, 3, 4]);
    expect(ld.itemListElement.at(-1)?.item).toBe('https://afdindia.com/page/nid-coaching-in-idukki');
  });

  it('links to the pages above and beside it instead of the ordinary related posts', () => {
    const b = built();
    const next = b.pageBody.slice(b.pageBody.indexOf('class="ap-next"'));
    for (const path of ['/page/nid-coaching-in-kerala', '/page/nid-coaching-in-india', '/page/nid-coaching-in-ernakulam']) expect(next).toContain(`href="${path}"`);
  });

  it('adds no breadcrumb data to a page that is not local', () => {
    const r = buildKnorishPackage(ctx(), req());
    expect(r.ok && r.value.headerCode.includes('BreadcrumbList')).toBe(false);
  });
});

describe('where our centres are', () => {
  const blank = { streetAddress: '', locality: '', postalCode: '', latitude: undefined, longitude: undefined, mapsUrl: '', mapEmbedUrl: '', reviewsUrl: '', openingHours: '' };
  const EMBED = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1';
  const withPlaces = (over: object = {}): BuildContext => ({ ...ctx(), centres: CentresConfigSchema.parse({ centres: [{ id: 'kochi', ...blank, streetAddress: 'MI Arcade, Edappally', locality: 'Kochi', postalCode: '682024', mapsUrl: 'https://maps.app.goo.gl/abc', mapEmbedUrl: EMBED, ...over }] }) });
  const build = (c: BuildContext, d: Draft = draft) => { const r = buildKnorishPackage(c, { draft: d, check: contentCheck(d, rules), kind: 'page', path: '/page/x' }); if (!r.ok) throw new Error(r.error.join()); return r.value; };

  it('adds a "Visit our centres" section with the map to every page, and still passes the safety check on the body', () => {
    const b = build(withPlaces());
    expect(b.pageBody).toContain('<h2>Visit our centres</h2>');
    expect(b.pageBody).toContain(`<iframe class="ap-map" src="${EMBED}"`);
    expect(b.pageBody).not.toMatch(/<script|<style/);
  });

  it('adds nothing without place details, and refuses a frame that is not a Google map', () => {
    expect(build({ ...ctx() }).pageBody).not.toContain('Visit our centres');
    expect(bodyProblems('<iframe src="https://evil.example/x"></iframe>')).toEqual(['the body contains an iframe that is not a Google map']);
    expect(bodyProblems(`<iframe class="ap-map" src="${EMBED}" loading="lazy"></iframe>`)).toEqual([]);
  });

  it('writes centre data for search engines only for a centre with a full address, with the map and phone', () => {
    const ld = build(withPlaces()).headerCode;
    expect(ld).toContain('"@type":"EducationalOrganization"');
    expect(ld).toContain('"streetAddress":"MI Arcade, Edappally"');
    expect(ld).toContain('"telephone":"+919895484652"');
    expect(ld).toContain('"hasMap":"https://maps.app.goo.gl/abc"');
    expect(build(withPlaces({ postalCode: '' })).headerCode).not.toContain('EducationalOrganization');
  });
});

describe('placeholders that are not quite right', () => {
  const offers = OffersConfigSchema.parse({ offers: [{ id: 'demo-class', kind: 'demo-class', title: 'Try a free demo class', promise: 'Sit in on a real class and meet the mentors.', button: 'Book my demo', exams: [], deliverUrl: '' }], deadlineFacts: [] });
  const withOffers = (): BuildContext => ({ ...ctx(), offers: { config: offers, exam: 'NID', ctx: { forms: ctx().forms, today: '2026-10-14', facts: new Map() } } });
  const built = (token: string) => { const d = { ...draft, body: body.replace('{{form:Book a demo}}', token) }; return buildKnorishPackage(withOffers(), { draft: d, check: contentCheck(d, rules), kind: 'blog', path: '/blog/post/x' }); };

  it('ignores a bracketed note a writer adds after an offer line', () => {
    const r = built('{{offer:demo-class@closing}} (Try a free demo class)');
    expect(r.ok && r.value.pageBody).toContain('data-afd-offer="demo-class"');
    expect(r.ok && r.value.pageBody.includes('(Try a free demo class)')).toBe(false);
  });

  it('refuses to paste a placeholder that was left in the text', () => {
    const r = built('See {{offer:demo-class@closing}} below');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.join()).toContain('placeholder was left');
  });
});

describe('the exam checker in a built page', () => {
  const checker = '<div class="afd-tool" data-afd-tool="{}">checker</div>';
  const withChecker = (): BuildContext => ({ ...ctx(), toolsByExam: new Map([['NID', checker]]) });

  it('adds the exam checker once to a page about that exam', () => {
    const built = buildKnorishPackage(withChecker(), req());
    expect(built.ok && built.value.pageBody.split('data-afd-tool').length - 1).toBe(1);
  });

  it('adds nothing when no checker exists for the exam', () => {
    const built = buildKnorishPackage({ ...ctx(), toolsByExam: new Map([['UCEED', checker]]) }, req());
    expect(built.ok && built.value.pageBody.includes('data-afd-tool')).toBe(false);
  });

  it('carries the brand colours on the footer script', () => {
    const built = buildKnorishPackage({ ...ctx(), brand: { primary: '#AA0000', ink: '#111111', surface: '#FFFFFF', accent: '#6F7B52' } }, req());
    expect(built.ok && built.value.footerCode).toContain('data-afd-theme="--b-primary:#AA0000');
  });
});
