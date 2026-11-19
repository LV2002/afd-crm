// Plain word matching to tell which exam and what kind of question a search is about. It never guesses beyond the words
// someone typed: a search with no exam name in it belongs to no exam.
const EXAMS: readonly (readonly [string, RegExp])[] = [
  ['UCEED', /\buceed\b/], ['CEED', /\bceed\b/], ['NID', /\bnid\b/], ['NIFT', /\bnift\b/], ['NATA', /\bnata\b/], ['JEE Paper 2', /\bjee\b/],
];

export interface Intent { readonly id: string; readonly phrase: string; readonly keyword: string; readonly match: RegExp; readonly inPath: RegExp }

export const INTENTS: readonly Intent[] = [
  { id: 'syllabus', phrase: 'syllabus and exam pattern', keyword: 'syllabus', match: /syllabus|exam pattern|marking|topics/, inPath: /syllabus|pattern/ },
  { id: 'eligibility', phrase: 'eligibility and age limit', keyword: 'eligibility', match: /eligib|age limit|qualif|who can/, inPath: /eligib|age/ },
  { id: 'dates', phrase: 'dates and how to apply', keyword: 'exam date', match: /\bdates?\b|registration|apply|application|admit card|notification|schedule|result/, inPath: /date|apply|registration|result|notification/ },
  { id: 'papers', phrase: 'previous year papers', keyword: 'previous year question papers', match: /previous year|question paper|sample paper|past paper|mock|solved/, inPath: /paper|question|mock/ },
  { id: 'preparation', phrase: 'preparation guide', keyword: 'preparation', match: /prepar|crack|study plan|tips|books|strategy|portfolio|studio test|how to/, inPath: /prepar|plan|tips|how-to|books|strategy/ },
  { id: 'colleges', phrase: 'colleges, cutoffs and seats', keyword: 'cutoff', match: /college|cut ?offs?|seats|rank|admission/, inPath: /college|cutoff|seat|admission/ },
  { id: 'coaching', phrase: 'coaching and classes', keyword: 'coaching', match: /coaching|classes|institute|academy|kochi|kannur|kerala|online/, inPath: /coaching|class|kochi|kannur|kerala|online/ },
  { id: 'career', phrase: 'courses and careers', keyword: 'career', match: /course|career|scope|after 12|b\.?des|m\.?des/, inPath: /course|career|scope|des/ },
];

// Searches we never write pages for: the house rule is no fees or prices (CLAUDE.md).
const MONEY = /\b(fees?|price|prices|pricing|cost|costs|discount|emi|instalments?)\b/;

export const examOf = (text: string): string | undefined => EXAMS.find(([, re]) => re.test(text.toLowerCase()))?.[0];
export const intentOf = (query: string): Intent | undefined => INTENTS.find((i) => i.match.test(query.toLowerCase()));
export const isMoneyTopic = (query: string): boolean => MONEY.test(query.toLowerCase());

const slugOf = (exam: string): string => (exam === 'JEE Paper 2' ? 'jee' : exam.toLowerCase());

// Is there already a page for this exam and this kind of question? Judged only from the page addresses.
export const hasPageFor = (pages: readonly string[], exam: string, intent: Intent): boolean =>
  pages.some((p) => { const path = p.toLowerCase(); return path.includes(slugOf(exam)) && intent.inPath.test(path); });

// Places that go by more than one name on the web. A search for "coaching in Cochin" and a page about Kochi or Ernakulam are about the same place.
const PLACE_ALIASES: Record<string, string> = {
  cochin: 'kochi', ernakulam: 'kochi', kochi: 'kochi', trivandrum: 'thiruvananthapuram', thiruvananthapuram: 'thiruvananthapuram', calicut: 'kozhikode', kozhikode: 'kozhikode',
  kasargod: 'kasaragod', kasaragod: 'kasaragod', cannanore: 'kannur', kannur: 'kannur', alleppey: 'alappuzha', alappuzha: 'alappuzha', palghat: 'palakkad', palakkad: 'palakkad',
  trichur: 'thrissur', thrissur: 'thrissur', quilon: 'kollam', kollam: 'kollam', bangalore: 'bengaluru', bengaluru: 'bengaluru', mysore: 'mysuru', mysuru: 'mysuru',
};
const FILLER = new Set(['a', 'an', 'the', 'in', 'for', 'of', 'and', 'to', 'at', 'on', 'best', 'top', 'classes', 'class', 'institute', 'academy', 'centre', 'center', 'online', 'near', 'me']);

export const tokensOf = (text: string): Set<string> => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w !== '' && !FILLER.has(w)).map((w) => PLACE_ALIASES[w] ?? w));

export interface SitePageText { readonly path: string; readonly text: string }

// The page that already answers a keyword: one whose address, title and main heading hold every word of it (places under any of their names).
// A page about several places or exams, such as "nift-nid-uceed-coaching-thrissur", holds the words of each of them. Judged from the words only.
export function pageFor(keyword: string, pages: readonly SitePageText[]): string | undefined {
  const need = [...tokensOf(keyword)];
  if (need.length === 0) return undefined;
  return pages.find((p) => { const have = tokensOf(p.text); return need.every((w) => have.has(w)); })?.path;
}
