import { marked } from 'marked';
import { describe, expect, it } from 'vitest';
import { DESIGN_VERSION, SITE_CSS, bodyProblems, designHeader, styleArticle, type ArticleOptions } from '../src/index.ts';

const md = [
  '# NID DAT preparation: a plan that works',
  'Many students ask where to begin with NID DAT. This guide gives a plan you can follow.',
  '## Key takeaways', '- Start early', '- Review every attempt',
  '## How do you prepare for NID DAT?', 'Start with simple drawing tasks and review them weekly with a mentor.',
  '> **Watch out:** do not change plans every week.', '| Week | Focus |\n|---|---|\n| 1 | Drawing |\n| 2 | Mocks |',
  '## Frequently asked questions', '### Is a mock test needed?', 'Yes, one timed mock every weekend helps.', '### Can parents help?', 'Yes, by protecting sleep and routine.',
  '## Next step', 'Book a free demo class.',
].join('\n\n');
const html = marked.parse(md, { async: false, gfm: true });
const options = (over: Partial<ArticleOptions> = {}): ArticleOptions => ({
  variant: 'blog', title: 'x', topic: 'NID', siteUrl: 'https://afdindia.com', author: { name: 'Julie James', role: 'Mentor', bio: 'Guides design aspirants.', photoUrl: '' },
  dateLabel: '16 October 2026', related: [{ title: 'NIFT vs NID vs UCEED', path: '/blog/post/nift-vs-nid-vs-uceed' }],
  centres: [{ name: 'Kochi', phone: '9895484652', whatsapp: '919895484652' }, { name: 'Kannur', phone: '9895484651', whatsapp: '919895484651' }], demoUrl: '/page/demo-class', railOffer: '', keyDates: [], ctas: undefined, exam: undefined, intent: undefined, trail: [], centresBlock: '', ...over,
});
const out = (over: Partial<ArticleOptions> = {}): string => styleArticle(html, options(over));

describe('the article in afdindia\'s design', () => {
  it('wraps everything in the scoped article, with breadcrumbs, a topic label and the title lead-in in brand orange', () => {
    const a = out();
    expect(a).toMatch(/^<article class="afd-post" id="afd-post">/);
    expect(a).toContain('<p class="ap-crumbs"><a href="https://afdindia.com">Home</a> &rsaquo; <a href="https://afdindia.com/blog">Blog</a> &rsaquo; NID</p>');
    expect(a).toContain('<span class="ap-chip">NID</span>');
    expect(a).toContain('<h1><span class="o">NID DAT preparation:</span> a plan that works</h1>');
  });

  it('shows who wrote it, when, and how long it takes to read', () => {
    expect(out()).toMatch(/<b>Julie James<\/b>, Mentor<br>Updated 16 October 2026 &middot; \d+ min read/);
  });

  it('turns key takeaways into a box, and gives every section an anchor with a contents list', () => {
    const a = out();
    expect(a).toContain('<div class="ap-take" id="key-takeaways"><b>Key takeaways</b><ul>');
    expect(a).toContain('<section id="how-do-you-prepare-for-nid-dat"><h2>How do you prepare for NID DAT?</h2>');
    expect(a).toContain('<li><a href="#how-do-you-prepare-for-nid-dat">How do you prepare for NID DAT?</a></li>');
    expect(a).not.toContain('<li><a href="#key-takeaways">');
    expect(a).toContain('class="ap-toc ap-toc-m"');
    expect(a).toContain('<aside class="ap-side">');
  });

  it('makes a coloured callout from a quote, wraps tables so they scroll, and makes questions an accordion', () => {
    const a = out();
    expect(a).toContain('<div class="ap-co warning" role="note"><div><span class="l">Watch out</span>');
    expect(a).toContain('<div class="ap-tw" tabindex="0" role="region" aria-label="Scrollable table"><table>');
    expect(a).toContain('<details><summary>Is a mock test needed?</summary><p>Yes, one timed mock every weekend helps.</p></details>');
  });

  it('ends with a call-to-action panel using the centres\' own numbers, an author card and related posts', () => {
    const a = out();
    expect(a).toContain('href="tel:9895484652"');
    expect(a).toContain('href="https://wa.me/919895484651"');
    expect(a).toContain('<a class="ap-btn ap-x" href="/page/demo-class">Book a free demo class</a>');
    expect(a).toContain('<section class="ap-author"');
    expect(a).toContain('About Julie James');
    expect(a).toContain('<p class="ap-nh">Read next</p>');
    expect(a).toContain('href="/blog/post/nift-vs-nid-vs-uceed"');
  });

  it('leaves out the author card without a bio, and the byline, breadcrumbs\' blog step and author on an ordinary page', () => {
    expect(out({ author: { name: 'Julie James', role: '', bio: '', photoUrl: '' } })).not.toContain('ap-author');
    const page = out({ variant: 'page', author: undefined, related: [] });
    expect(page).not.toContain('ap-by');
    expect(page).not.toContain('ap-author');
    expect(page).not.toContain('/blog"');
    expect(page).not.toContain('Read next');
  });

  it('adds no heading beyond the writer\'s own, and nothing the site would reject: no style attributes, scripts or handlers', () => {
    const a = out();
    expect(bodyProblems(a)).toEqual([]);
    expect((a.match(/<h1/g) ?? []).length).toBe(1);
    expect(a).not.toMatch(/<h2[^>]*>(Talk to a mentor|Read next|About)/);
  });

  it('keeps offer blocks and their forms intact inside the sections', () => {
    const withOffer = styleArticle(marked.parse('# T: x\n\nIntro text here.\n\n## A section\n\n<!--offer--><div class="afd-offer" data-afd-offer="demo-class"><p>Offer</p><form data-afd-lead></form></div><!--/offer-->\n\nMore text.', { async: false }), options());
    expect(withOffer).toContain('data-afd-offer="demo-class"');
    expect(withOffer).toContain('<form data-afd-lead');
  });

  it('escapes names from the settings file', () => {
    expect(out({ author: { name: '<img src=x>', role: '', bio: 'Bio', photoUrl: '' } })).not.toContain('<img src=x>');
  });
});

describe('the stylesheet and header code', () => {
  it('carries the site\'s fonts and colours, scoped so it cannot restyle the rest of the page', () => {
    expect(SITE_CSS).toContain('Cabin Sketch');
    expect(SITE_CSS).toContain('Montserrat');
    expect(SITE_CSS).toContain('#D84315');
    expect(SITE_CSS).toContain('#F9A825');
    expect(SITE_CSS).toContain('#25D366');
    const unscoped = SITE_CSS.split('}').map((r) => r.trim()).filter((r) => r !== '' && !r.startsWith('@') && !r.includes('.afd-') && !/^(from|to)\{/.test(r) && !/^\s*[\d.]+%/.test(r));
    expect(unscoped).toEqual([]);
  });

  it('puts fonts, the versioned style block in the header code', () => {
    const h = designHeader();
    expect(h).toContain('fonts.googleapis.com/css2?family=Cabin+Sketch');
    expect(h).toContain(`<style data-afd-design="${DESIGN_VERSION}">`);
  });
});
