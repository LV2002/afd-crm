import * as cheerio from 'cheerio';
import { err, ok, type Result } from '@mb/platform';

// What a search engine reads from a page: title, description, canonical, every heading, structured data, and the text itself.
export interface SeoSignature {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly headings: readonly string[];
  readonly jsonLd: readonly string[];
  readonly text: string;
}

// Everything we add to a page (offers, calls to action, free checkers) is marked, so it can be taken out again to prove nothing else changed.
const OUR_BLOCKS = '[data-afd-offer],[data-afd-cta],[data-afd-tool],[data-afd-wrap]';

const squash = (t: string): string => t.replace(/\s+/g, ' ').trim();

function signature(html: string, ignoreOffers: boolean): SeoSignature {
  const $ = cheerio.load(html);
  if (ignoreOffers) $(OUR_BLOCKS).remove();
  const jsonLd = $('script[type="application/ld+json"]').toArray().map((el) => squash($(el).text()));
  $('script,style,noscript').remove();
  return {
    title: squash($('title').first().text()), description: $('meta[name="description"]').attr('content')?.trim() ?? '', canonical: $('link[rel="canonical"]').attr('href')?.trim() ?? '',
    headings: $('h1,h2,h3,h4,h5,h6').toArray().map((el) => `${el.tagName}:${squash($(el).text())}`), jsonLd, text: squash($('body').text()),
  };
}

// The rule for conversion changes (CLAUDE.md): they may add our offer blocks and nothing else. After removing the blocks,
// the page must be exactly what it was, and the blocks themselves must hold no heading, script or styling.
export function checkAdditiveOnly(before: string, after: string): Result<void, string[]> {
  const problems: string[] = [];
  const a = signature(before, true);
  const b = signature(after, true);
  for (const key of ['title', 'description', 'canonical'] as const) if (a[key] !== b[key]) problems.push(`the ${key} changed`);
  if (a.headings.join('|') !== b.headings.join('|')) problems.push('a heading changed, appeared or disappeared');
  if (a.jsonLd.join('|') !== b.jsonLd.join('|')) problems.push('the structured data changed');
  if (a.text !== b.text) problems.push('the page text changed');
  const $ = cheerio.load(after);
  for (const block of $(OUR_BLOCKS).toArray()) {
    const inner = $(block);
    if (inner.find('h1,h2,h3,h4,h5,h6').length > 0) problems.push('a block we added contains a heading');
    // The one block that carries our stylesheet (data-afd-css) may hold style and link elements, and nothing else a script could hide in.
    if (inner.find(inner.is('[data-afd-css]') ? 'script:not([type="application/ld+json"]),iframe' : 'script,style,iframe').length > 0 || /\sstyle\s*=|\son[a-z]+\s*=/i.test($.html(block))) problems.push('a block we added contains a script, style or event handler');
  }
  return problems.length === 0 ? ok(undefined) : err(problems);
}
