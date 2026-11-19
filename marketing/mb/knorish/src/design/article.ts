import type { RenderedCtas } from '@mb/lead-intake';
import * as cheerio from 'cheerio';

export interface ArticleOptions {
  readonly variant: 'blog' | 'page';
  readonly title: string; // used if the text has no H1
  readonly topic: string; // the small label above the title, e.g. NID
  readonly siteUrl: string;
  readonly author: { readonly name: string; readonly role: string; readonly bio: string; readonly photoUrl: string; readonly url?: string } | undefined;
  readonly dateLabel: string; // "16 October 2026"
  readonly related: readonly { readonly title: string; readonly path: string }[];
  readonly centres: readonly { readonly name: string; readonly phone: string; readonly whatsapp: string }[];
  readonly demoUrl: string;
  // The card beside the article: the exam's free resource or the demo class, already built with its compact form. Empty for none.
  readonly railOffer: string;
  // Upcoming dates for the exam, shown beside the article and kept live by the footer script.
  readonly keyDates: readonly { readonly id: string; readonly label: string; readonly value: string }[];
  // Tailored calls to action, planned once the number of sections is known. Undefined leaves the page with the plain closing panel.
  readonly ctas: ((sections: number) => RenderedCtas | undefined) | undefined;
  readonly exam: string | undefined;
  readonly intent: string | undefined;
  // Pages above this one (a local page sits under its state and country page), shown in the breadcrumb.
  readonly trail: readonly { readonly title: string; readonly path: string }[];
  // "Visit our centres": the map and details of each centre, already built. Empty when no centre has place details yet.
  readonly centresBlock: string;
}

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => `&#${String(c.charCodeAt(0))};`);
const slug = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
const initials = (name: string): string => name.split(/\s+/).filter((w) => w !== '').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
const TAKEAWAYS = /key takeaways|quick answer|in short|at a glance/i;
const FAQ = /frequently asked/i;

// The title keeps its first clause (before a colon) in the brand orange, as the site's own headings do.
const titleHtml = (t: string): string => { const i = t.indexOf(':'); return i > 0 && t.slice(i + 1).trim() !== '' ? `<span class="o">${esc(t.slice(0, i + 1))}</span> ${esc(t.slice(i + 1).trim())}` : esc(t); };

function callout(quote: cheerio.Cheerio<never>): string {
  const strong = quote.find('strong').first();
  const label = strong.text().replace(/:\s*$/, '').trim();
  const tone = /watch|warning|careful|mistake/i.test(label) ? 'warning' : /source|fact|check/i.test(label) ? 'fact' : 'tip';
  if (label !== '') strong.remove();
  return `<div class="ap-co ${tone}" role="note"><div><span class="l">${esc(label === '' ? 'Tip' : label)}</span>${quote.html() ?? ''}</div></div>`;
}

// Turns the plain HTML of a draft into afdindia's page: header, key-takeaways box, contents list, sections, callouts, scrollable
// tables, question-and-answer accordion, the closing call to action, author card and related posts. Classes only, no styling attributes.
export function styleArticle(bodyHtml: string, o: ArticleOptions): string {
  const $ = cheerio.load(`<div id="root">${bodyHtml}</div>`, null, false);
  const nodes = $('#root').children().toArray(); // elements only: the comment markers and stray whitespace are left behind
  const h1 = nodes.find((n) => n.name === 'h1');
  const title = h1 === undefined ? o.title : $(h1).text().trim();
  const body = nodes.filter((n) => n !== h1);
  const firstH2 = body.findIndex((n) => n.name === 'h2');
  const intro = firstH2 === -1 ? body : body.slice(0, firstH2);
  const rest = firstH2 === -1 ? [] : body.slice(firstH2);

  const transform = (html: string): string => {
    const $$ = cheerio.load(`<div id="x">${html}</div>`, null, false);
    $$('#x blockquote').each((_i, el) => { $$(el).replaceWith(callout($$(el) as never)); });
    $$('#x table').each((_i, el) => { $$(el).wrap('<div class="ap-tw" tabindex="0" role="region" aria-label="Scrollable table"></div>'); });
    return $$('#x').html() ?? '';
  };
  const htmlOf = (list: readonly (typeof body)[number][]): string => transform(list.map((n) => $.html(n)).join(''));

  const sections: { id: string; heading: string; html: string; toc: boolean }[] = [];
  const used = new Set<string>();
  for (let i = 0; i < rest.length;) {
    const head = rest[i];
    let j = i + 1;
    while (j < rest.length && rest[j]?.name !== 'h2') j++;
    const content = rest.slice(i + 1, j);
    const heading = head === undefined ? '' : $(head).text().trim();
    let id = slug(heading);
    for (let n = 2; used.has(id); n++) id = `${slug(heading)}-${String(n)}`;
    used.add(id);
    if (TAKEAWAYS.test(heading)) sections.push({ id, heading, toc: false, html: `<div class="ap-take" id="${id}"><b>${esc(heading)}</b>${content.filter((n) => n.name === 'ul' || n.name === 'ol').map((n) => $.html(n)).join('')}</div>` });
    else if (FAQ.test(heading)) {
      const $f = cheerio.load(`<div id="f">${htmlOf(content)}</div>`, null, false);
      const items: string[] = [];
      $f('#f h3').each((_k, h) => { const answer = $f(h).nextUntil('h3').toArray().map((n) => $f.html(n)).join(''); items.push(`<details><summary>${$f(h).text()}</summary>${answer}</details>`); });
      sections.push({ id, heading, toc: true, html: `<section id="${id}"><h2>${esc(heading)}</h2>${items.length > 0 ? items.join('') : $f('#f').html() ?? ''}</section>` });
    } else sections.push({ id, heading, toc: true, html: `<section id="${id}"><h2>${esc(heading)}</h2>${htmlOf(content)}</section>` });
    i = j;
  }

  const numbered = sections.filter((s) => s.toc).length;
  const ctas = o.ctas?.(numbered);
  const tocItems = sections.filter((s) => s.toc).map((s) => `<li><a href="#${s.id}">${esc(s.heading)}</a></li>`).join('');
  const mobileToc = tocItems === '' ? '' : `<details class="ap-toc ap-toc-m" open><summary>In this article</summary><ol>${tocItems}</ol></details>`;
  const takeawayAt = sections.findIndex((s) => !s.toc);
  let seenToc = 0;
  const parts = sections.flatMap((s) => {
    if (s.toc) seenToc += 1;
    const here = s.toc ? ctas?.inline.find((x) => x.afterSection === seenToc) : undefined;
    return here === undefined ? [s.html] : [s.html, here.html];
  });
  if (mobileToc !== '') parts.splice(takeawayAt === -1 ? 0 : takeawayAt + 1, 0, mobileToc);

  const readMinutes = Math.max(1, Math.round($('<div>').html(bodyHtml).text().split(/\s+/).filter((w) => w !== '').length / 200));
  const avatar = (px: number): string => (o.author?.photoUrl ?? '') !== '' ? `<img class="ap-av" src="${esc(o.author?.photoUrl ?? '')}" alt="${esc(o.author?.name ?? '')}" width="${String(px)}" height="${String(px)}" loading="lazy" decoding="async">` : `<div class="ap-av" aria-hidden="true">${esc(initials(o.author?.name ?? ''))}</div>`;
  const byline = o.variant === 'blog' ? `<div class="ap-by">${o.author === undefined ? '' : avatar(46)}<div>${o.author === undefined ? '' : `<b>${esc(o.author.name)}</b>${o.author.role === '' ? '' : `, ${esc(o.author.role)}`}<br>`}Updated ${esc(o.dateLabel)} &middot; ${String(readMinutes)} min read</div></div>` : '';
  const crumbs = `<p class="ap-crumbs"><a href="${esc(o.siteUrl)}">Home</a> &rsaquo; ${o.variant === 'blog' ? `<a href="${esc(o.siteUrl)}/blog">Blog</a> &rsaquo; ` : ''}${o.trail.map((t) => `<a href="${esc(o.siteUrl)}${esc(t.path)}">${esc(t.title)}</a> &rsaquo; `).join('')}${esc(o.topic)}</p>`;
  const header = `<header>${crumbs}<span class="ap-chip">${esc(o.topic)}</span><h1>${titleHtml(title)}</h1>${byline}${ctas?.strip ?? ''}</header>`;

  const acts = o.centres.flatMap((c) => [`<a class="ap-btn ap-a" href="tel:${esc(c.phone)}">Call ${esc(c.name)}</a>`, `<a class="ap-btn ap-w" href="https://wa.me/${esc(c.whatsapp)}">WhatsApp ${esc(c.name)}</a>`]).join('');
  const end = o.centres.length === 0 ? '' : `<section class="ap-end"><p class="ap-lh">Talk to a mentor before you decide</p><p>Tell us which exam you are aiming for and we will point you to the right first step.</p><div class="ap-acts">${acts}<a class="ap-btn ap-x" href="${esc(o.demoUrl)}">Book a free demo class</a></div></section>`;
  const authorCard = o.variant === 'blog' && o.author !== undefined && o.author.bio !== '' ? `<section class="ap-author" aria-label="About the author">${avatar(96)}<div><p class="ap-an">About ${(o.author.url ?? '') === '' ? esc(o.author.name) : `<a href="${esc((o.author.url ?? '').startsWith('http') ? (o.author.url ?? '') : `${o.siteUrl}${o.author.url ?? ''}`)}">${esc(o.author.name)}</a>`}</p>${o.author.role === '' ? '' : `<p class="r">${esc(o.author.role)}</p>`}<p>${esc(o.author.bio)}</p></div></section>` : '';
  const next = o.related.length === 0 ? '' : `<p class="ap-nh">Read next</p><div class="ap-next">${o.related.slice(0, 6).map((r) => `<a href="${esc(r.path)}">${esc(r.title)}<span>Read the guide &rarr;</span></a>`).join('')}</div>`;

  const main = `${header}${htmlOf(intro)}${parts.join('')}${ctas === undefined ? end : ctas.closing}${o.centresBlock}${authorCard}${next}`;
  const keyDates = o.keyDates.length === 0 ? '' : `<div class="ap-kd"><b>Key dates</b><dl>${o.keyDates.map((k) => `<div><dt>${esc(k.label)}</dt><dd><span data-afd-fact="${esc(k.id)}">${esc(k.value)}</span></dd></div>`).join('')}</dl></div>`;
  const first = o.centres[0];
  const ask = first === undefined ? '' : `<div class="ap-ask"><b>Talk to a mentor</b><p>Tell us your exam and we will point you to the right first step.</p><div class="ap-acts">${o.centres.map((c) => `<a class="ap-btn ap-g" href="tel:${esc(c.phone)}">Call ${esc(c.name)}</a>`).join('')}<a class="ap-btn ap-w" href="https://wa.me/${esc(first.whatsapp)}">WhatsApp</a></div></div>`;
  const toc = tocItems === '' ? '' : `<nav class="ap-toc" aria-label="In this article"><b>In this article</b><ol>${tocItems}</ol></nav>`;
  const rail = `${toc}${keyDates}${o.railOffer}${ask}`;
  const side = rail === '' ? '' : `<aside class="ap-side"><div class="ap-side-in">${rail}</div></aside>`;
  // Small screens: the rail is hidden, so a bar pinned to the bottom keeps the call and WhatsApp one tap away.
  const bar = first === undefined ? '' : `<div class="ap-bar"><a class="ap-btn ap-a" href="tel:${esc(first.phone)}">Call ${esc(first.name)}</a><a class="ap-btn ap-w" href="https://wa.me/${esc(first.whatsapp)}">WhatsApp</a>${ctas === undefined || ctas.sheet === '' ? '' : '<button type="button" class="ap-btn ap-o" data-afd-open="sheet">Call me back</button>'}</div>`;
  const mark = `${o.exam === undefined ? '' : ` data-afd-exam="${esc(o.exam)}"`}${o.intent === undefined ? '' : ` data-afd-intent="${esc(o.intent)}"`}`;
  return `<article class="afd-post" id="afd-post"${mark}><div class="ap-prog" aria-hidden="true"><i></i></div><div class="ap-wrap"><div class="ap-main">${main}</div>${side}</div>${bar}${ctas?.sheet ?? ''}${ctas?.slide ?? ''}</article>`;
}
