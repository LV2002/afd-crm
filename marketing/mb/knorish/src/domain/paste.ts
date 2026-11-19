import type { KnorishPackage } from './package.ts';

export interface PasteStep {
  readonly number: number;
  readonly label: string;
  // Where it goes in Knorish, in the owner's own words for the fields.
  readonly where: string;
  readonly content: string;
}

// The six pieces as numbered steps, in the order they are pasted. Empty pieces are skipped.
export function pasteSteps(pkg: KnorishPackage): PasteStep[] {
  const pieces: [string, string, string][] = [
    ['Meta title', 'Page settings, SEO, Meta title', pkg.metaTitle],
    ['Meta description', 'Page settings, SEO, Meta description', pkg.metaDescription],
    ['Meta keywords', 'Page settings, SEO, Meta keywords', pkg.metaKeywords],
    ['Header code', 'Page settings, Custom header code', pkg.headerCode],
    ['Page body', 'The page itself: an HTML block holding the whole body', pkg.pageBody],
    ['Footer code', 'Page settings, Custom footer code', pkg.footerCode],
  ];
  return pieces.filter(([, , content]) => content !== '').map(([label, where, content], i) => ({ number: i + 1, label, where, content }));
}

// What a page looked like when read again after pasting. The web app fills this from its page reading.
export interface PageSeen {
  readonly title: string;
  readonly metaDescription: string;
  readonly metaKeywords: string;
  readonly leadScript: boolean;
  readonly jsonLdTypes: readonly string[];
  // The page's own text, to find our new text on the live page.
  readonly bodyText: string;
  readonly offerIds: readonly string[];
  readonly designVersion: string;
}

export interface PasteCheck {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

const squash = (t: string): string => t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// After the owner pastes, the page is read again and compared with what we sent, so a missed paste is found the same day.
export function verifyPaste(pkg: KnorishPackage, seen: PageSeen): PasteCheck[] {
  const check = (label: string, ok: boolean, good: string, bad: string): PasteCheck => ({ label, ok, detail: ok ? good : bad });
  const wantTypes = [...pkg.headerCode.matchAll(/"@type":"(Article|FAQPage|BreadcrumbList|EducationalOrganization)"/g)].map((m) => m[1] ?? '');
  const wantDesign = /data-afd-design="([^"]+)"/.exec(pkg.headerCode)?.[1] ?? '';
  const blockIds = [...pkg.pageBody.matchAll(/data-afd-offer="([a-z0-9-]+)"/g)].map((m) => m[1] ?? '');
  // A short, distinctive run of words from the first real paragraph we sent (the title block and menus are not compared).
  const firstParagraph = [...pkg.pageBody.matchAll(/<p>(.*?)<\/p>/gs)].map((m) => squash(m[1] ?? '')).find((t) => t.split(' ').length >= 8) ?? '';
  const snippet = firstParagraph.split(' ').slice(0, 8).join(' ');
  return [
    check('Meta title', pkg.metaTitle === '' || seen.title.trim() === pkg.metaTitle.trim(), 'The title on the page matches.', `The page still shows "${seen.title.trim().slice(0, 60)}".`),
    check('Meta description', pkg.metaDescription === '' || seen.metaDescription.trim() === pkg.metaDescription.trim(), 'The description matches.', 'The description on the page is different from the one we wrote.'),
    check('Meta keywords', pkg.metaKeywords === '' || seen.metaKeywords.trim() === pkg.metaKeywords.trim(), 'The keywords match.', 'The keywords on the page are different.'),
    check('Header code', wantTypes.every((t) => seen.jsonLdTypes.includes(t)) && (wantDesign === '' || seen.designVersion === wantDesign), wantDesign === '' ? 'The structured data is on the page.' : 'The structured data and the page design are on the page.', `Missing from the header code: ${[...wantTypes.filter((t) => !seen.jsonLdTypes.includes(t)), ...(wantDesign !== '' && seen.designVersion !== wantDesign ? ['the page design (style block)'] : [])].join(', ')}.`),
    check('Page body', blockIds.length > 0 ? blockIds.every((id) => seen.offerIds.includes(id)) : snippet === '' || squash(seen.bodyText).includes(snippet), blockIds.length > 0 ? 'The offer block(s) are on the page.' : 'The new text is on the page.', blockIds.length > 0 ? `Missing offer block(s): ${blockIds.filter((id) => !seen.offerIds.includes(id)).join(', ')}.` : 'The start of the new text was not found on the page.'),
    check('Footer code', !pkg.footerCode.includes('afd_attr') || seen.leadScript, 'The form script is on the page.', 'The form script is not on the page yet.'),
  ];
}
