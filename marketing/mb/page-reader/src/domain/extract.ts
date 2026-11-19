import * as cheerio from 'cheerio';
import type { PageFacts } from './page-facts.ts';

const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;
const WHATSAPP = /wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i;
type LdNode = { '@type'?: string | string[]; '@graph'?: LdNode[] };

// Every @type named in a JSON-LD block, including those inside an @graph list.
function jsonLdTypes(data: unknown): string[] {
  const nodes: LdNode[] = ([] as unknown[]).concat(data).filter((n): n is LdNode => typeof n === 'object' && n !== null);
  return nodes.flatMap((n) => [...[n['@type'] ?? []].flat(), ...jsonLdTypes(n['@graph'] ?? [])]);
}
const words = (text: string): string[] => text.split(/\s+/).filter((w) => w !== '');
const lastTen = (raw: string): string => raw.replace(/\D/g, '').slice(-10);

export function extractPageFacts(html: string, url: string, status: number): PageFacts {
  const $ = cheerio.load(html);
  const attr = (selector: string, name: string): string => $(selector).first().attr(name)?.trim() ?? '';

  const headings = $('h1,h2,h3,h4,h5,h6').toArray().map((el) => ({ level: Number(el.tagName.slice(1)), text: $(el).text().replace(/\s+/g, ' ').trim() }));
  const sections = $('h2').toArray().map((el) => ({
    heading: $(el).text().replace(/\s+/g, ' ').trim(),
    answerWords: words($(el).nextUntil('h1,h2,h3').filter('p').first().text()).length,
  }));

  const body = $('body').clone();
  body.find('script,style,noscript,header,footer,nav').remove();
  const text = body.text().replace(/\s+/g, ' ').trim();
  const years = [...new Set([...text.replace(/©[^.]{0,60}/g, '').matchAll(/\b(20[2-3]\d)\b/g)].map((m) => Number(m[1])))].sort();

  const hrefs = $('a[href]').toArray().map((el) => ({ href: $(el).attr('href') ?? '', text: $(el).text().replace(/\s+/g, ' ').trim() }));
  const tel = hrefs.filter((l) => l.href.startsWith('tel:')).map((l) => l.href);
  const wa = hrefs.filter((l) => WHATSAPP.test(l.href)).map((l) => l.href);
  const numbers = new Set<string>([...text.matchAll(PHONE)].map((m) => lastTen(m[0])));
  for (const h of tel) numbers.add(lastTen(h));
  for (const h of wa) { const n = /(?:wa\.me\/|phone=)(\d{10,13})/.exec(h)?.[1]; if (n !== undefined) numbers.add(lastTen(n)); }

  const allElements = $('body *').toArray(); // document order, so a form's place on the page is its index share
  const forms = $('form').toArray().map((el) => {
    const fields = $(el).find('input,select,textarea').toArray().map((f) => $(f).attr('name') ?? '').filter((n) => n !== '');
    return { fields, hasPhone: fields.some((n) => /phone|mobile|tel/i.test(n)) || $(el).find('input[type=tel]').length > 0, textOffsetShare: allElements.indexOf(el) / allElements.length };
  });

  const jsonLd = $('script[type="application/ld+json"]').toArray().map((el) => {
    try {
      const data = JSON.parse($(el).text()) as unknown;
      return { types: jsonLdTypes(data), valid: true };
    } catch {
      return { types: [], valid: false };
    }
  });

  const images = $('img').toArray()
    .map((el) => ({ src: $(el).attr('src') ?? $(el).attr('data-src') ?? '', hasAlt: ($(el).attr('alt') ?? '').trim() !== '' }))
    .filter((i) => i.src !== '' && !i.src.startsWith('data:') && !i.src.includes('facebook.com/tr'));

  const path = (() => { try { return new URL(url).pathname.replace(/\/$/, '') || '/'; } catch { return url; } })();
  return {
    url, path, status,
    title: $('title').first().text().replace(/\s+/g, ' ').trim(),
    metaDescription: attr('meta[name="description"]', 'content'),
    metaKeywords: attr('meta[name="keywords"]', 'content'),
    textStart: text.slice(0, 600),
    bodyText: text.slice(0, 30_000),
    offerIds: $('[data-afd-offer]').toArray().map((el) => $(el).attr('data-afd-offer') ?? '').filter((id) => id !== ''),
    leadScript: html.includes('afd_attr'),
    designVersion: $('style[data-afd-design]').first().attr('data-afd-design') ?? '',
    canonical: attr('link[rel="canonical"]', 'href'),
    robotsMeta: attr('meta[name="robots"]', 'content'),
    lang: $('html').attr('lang')?.trim() ?? '',
    viewport: $('meta[name="viewport"]').length > 0,
    ogTitle: $('meta[property="og:title"]').length > 0,
    ogImage: $('meta[property="og:image"]').length > 0,
    headings, sections, wordCount: words(text).length, years, images,
    links: hrefs, forms, telLinks: tel, whatsappLinks: wa, phoneNumbers: [...numbers],
    jsonLd,
    hasByline: jsonLd.length > 0 && $('script[type="application/ld+json"]').text().includes('"author"') || $('[rel="author"],[class*="author"],[itemprop="author"]').length > 0 || /\b[Bb]y\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text.slice(0, 600)),
  };
}
