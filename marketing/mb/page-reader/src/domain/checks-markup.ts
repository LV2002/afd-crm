import { fail, ok, warn, type Check } from './audit.ts';

const EVENT_PATH = /workshop|webinar|demo|crash-course|seminar|open-day|event|batch|fair|tour/i;

export const markupChecks: readonly Check[] = [
  (p) => (p.status === 200 ? ok('status', 'index', 'The page loads (200).') : fail('status', 'index', `The page returned ${String(p.status)}.`, 'Fix or redirect this address.')),
  (p) => {
    if (p.canonical === '') return warn('canonical', 'index', 'No canonical address is declared.', 'Add a canonical link pointing to this page.');
    const same = new URL(p.canonical, p.url).pathname.replace(/\/$/, '') === new URL(p.url).pathname.replace(/\/$/, '');
    return same ? ok('canonical', 'index', 'Canonical points to this page.') : warn('canonical', 'index', `Canonical points elsewhere: ${p.canonical}`, 'Point the canonical at this page unless this page is meant to be a copy.');
  },
  (p) => (/noindex/i.test(p.robotsMeta) ? warn('noindex', 'index', 'The page tells search engines not to index it.', 'Remove noindex if you want this page found; otherwise keep it out of the sitemap.') : ok('noindex', 'index', 'The page can be indexed.')),
  (p) => {
    if (p.title === '') return fail('title', 'markup', 'No title.', 'Write a title of 30 to 60 characters with the main keyword.');
    if (p.title.length > 60) return warn('title', 'markup', `Title is ${String(p.title.length)} characters; results cut it off after about 60.`, 'Shorten to 60 characters or fewer, keeping the main keyword first.');
    if (p.title.length < 30) return warn('title', 'markup', `Title is only ${String(p.title.length)} characters.`, 'Use 30 to 60 characters.');
    return ok('title', 'markup', 'Title length is good.');
  },
  (p) => {
    if (p.metaDescription === '') return fail('meta-description', 'markup', 'No meta description.', 'Write 70 to 160 characters that say what the reader gets.');
    if (p.metaDescription.length > 160) return warn('meta-description', 'markup', `Meta description is ${String(p.metaDescription.length)} characters.`, 'Keep it to 160 or fewer.');
    if (p.metaDescription.length < 70) return warn('meta-description', 'markup', `Meta description is only ${String(p.metaDescription.length)} characters.`, 'Use 70 to 160 characters.');
    return ok('meta-description', 'markup', 'Meta description length is good.');
  },
  (p) => {
    const h1 = p.headings.filter((h) => h.level === 1).length;
    if (h1 === 0) return fail('h1', 'markup', 'No H1 heading.', 'Add one H1 with the main keyword.');
    return h1 > 1 ? warn('h1', 'markup', `${String(h1)} H1 headings.`, 'Keep exactly one H1; make the others H2.') : ok('h1', 'markup', 'One H1.');
  },
  (p) => {
    let previous = 0;
    for (const h of p.headings) {
      if (previous > 0 && h.level > previous + 1) return warn('heading-order', 'markup', `Heading jumps from H${String(previous)} to H${String(h.level)} ("${h.text.slice(0, 40)}").`, 'Do not skip heading levels.');
      previous = h.level;
    }
    return ok('heading-order', 'markup', 'Headings are in order.');
  },
  (p) => (p.wordCount < 300 ? warn('thin-content', 'markup', `Only ${String(p.wordCount)} words.`, 'Add useful detail, or merge this page into a stronger one.') : ok('thin-content', 'markup', `${String(p.wordCount)} words.`)),
  (p) => (p.jsonLd.some((j) => !j.valid) ? fail('schema-valid', 'markup', 'Structured data (JSON-LD) on this page does not parse.', 'Fix the JSON so search engines can read it.') : ok('schema-valid', 'markup', 'Structured data parses.')),
  (p) => (p.jsonLd.some((j) => j.types.includes('Event')) && !EVENT_PATH.test(p.path) ? warn('schema-event', 'markup', 'Event markup on a page that is not an event.', 'Remove Event markup from evergreen pages; keep it only for real, dated events.') : undefined),
  (p) => (p.lang === '' || !p.viewport || !p.ogTitle || !p.ogImage ? warn('page-meta', 'markup', `Missing: ${[p.lang === '' ? 'language' : '', p.viewport ? '' : 'mobile viewport', p.ogTitle ? '' : 'social title', p.ogImage ? '' : 'social image'].filter((x) => x !== '').join(', ')}.`, 'Add the missing tags in the header code.') : ok('page-meta', 'markup', 'Language, viewport and social tags are present.')),
];
