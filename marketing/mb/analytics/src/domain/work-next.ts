import { expectedCtr } from './ctr.ts';
import { addDays, daysBetween } from './dates.ts';
import type { AnalyticsReader } from './reader.ts';
import { examOf, hasPageFor, intentOf, isMoneyTopic, type Intent } from '@mb/topics';
import { DEFAULT_WORK_RULES, type WorkRules } from './work-rules.ts';

export type Goal = 'ranking' | 'visibility' | 'conversion' | 'new-content' | 'tracking';
export type Kind = 'near-page-one' | 'low-click-rate' | 'no-enquiries' | 'falling' | 'new-page' | 'tracking';

export interface Opportunity {
  readonly id: string;
  readonly kind: Kind;
  readonly goal: Goal;
  readonly page: string | undefined;
  readonly query: string | undefined;
  readonly headline: string;
  readonly evidence: readonly string[];
  readonly steps: readonly string[];
  // Always an estimate from typical click rates and your own numbers; never a promise.
  readonly estimate: { readonly text: string; readonly value: number } | undefined;
  readonly urgent: string | undefined;
  readonly score: number;
  readonly action: { readonly type: 'rework' | 'new-post' | 'offers' | 'check'; readonly path?: string; readonly keyword?: string; readonly topic?: string; readonly exam?: string };
}

export interface PageSignals { readonly staleYear: boolean }

export interface WorkInput {
  readonly today: string;
  readonly rules?: WorkRules;
  // Pages that are never touched (the city pages) and pages where no conversion change is allowed (/publisher, /user).
  readonly isProtected: (path: string) => boolean;
  readonly knownPages: readonly string[];
  readonly deadlines: readonly { readonly exam: string; readonly label: string; readonly date: string }[];
  readonly signals: ReadonlyMap<string, PageSignals>;
}

export interface WorkNext { readonly enough: boolean; readonly why: string; readonly items: readonly Opportunity[] }

const NO_CONVERSION = /^\/(publisher|user)(\/|$)/i;
const WINDOW = 28;
const LAG = 2;
const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
const n0 = (n: number): string => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

export function buildWorkNext(reader: AnalyticsReader, input: WorkInput): WorkNext {
  const r = input.rules ?? DEFAULT_WORK_RULES;
  const to = addDays(input.today, -LAG);
  const from = addDays(to, -(WINDOW - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(WINDOW - 1));
  const totals = reader.gscTotals(from, to);
  if (totals.impressions < r.minTotalImpressions) {
    return { enough: false, why: `Google has shown the site ${n0(totals.impressions)} times in these 28 days. That is too little to advise on without guessing. Update the numbers, or check again in a few weeks.`, items: [] };
  }

  const pages = reader.gscTopPages(from, to, 500);
  const earlier = new Map(reader.gscTopPages(prevFrom, prevTo, 500).map((p) => [p.page, p]));
  const visits = new Map(reader.ga4PageSessions(from, to).map((p) => [p.page, p.sessions]));
  const leads = new Map(reader.ga4LeadsByPage(from, to).map((p) => [p.page, p.leads]));
  const siteVisits = [...visits.values()].reduce((a, b) => a + b, 0);
  const siteLeads = [...leads.values()].reduce((a, b) => a + b, 0);
  const siteRate = siteVisits === 0 ? 0 : siteLeads / siteVisits;
  const out: Opportunity[] = [];
  const urgency = (text: string): string | undefined => {
    const exam = examOf(text);
    const d = input.deadlines.filter((x) => x.exam === exam).map((x) => ({ ...x, days: daysBetween(input.today, x.date) })).filter((x) => x.days >= 0 && x.days <= r.deadlineWindowDays).sort((a, b) => a.days - b.days)[0];
    return d === undefined ? undefined : `${d.label} in ${String(d.days)} day${d.days === 1 ? '' : 's'}`;
  };
  const add = (o: Omit<Opportunity, 'score' | 'urgent'> & { base: number; look: string }): void => {
    const { base, look, ...rest } = o;
    const urgent = urgency(look);
    out.push({ ...rest, urgent, score: base * (urgent === undefined ? 1 : r.urgentMultiplier) });
  };

  if (siteVisits >= r.noEnquiries.minVisits && siteLeads === 0) {
    out.push({ id: 'tracking', kind: 'tracking', goal: 'tracking', page: undefined, query: undefined, urgent: undefined, score: 1_000_000, estimate: undefined,
      headline: 'No enquiries are being recorded', evidence: [`${n0(siteVisits)} visits in 28 days, 0 enquiries recorded`],
      steps: ['Send yourself a test enquiry from a live page and check it appears in the Leads screen.', 'In Google Analytics, mark the event generate_lead as a key event (Admin, Events).', 'Check the footer script is pasted on the site (System check, Lead form address).'], action: { type: 'check' } });
  }

  for (const p of pages) {
    if (input.isProtected(p.page)) continue;
    const sig = input.signals.get(p.page);
    const ctr = p.impressions === 0 ? 0 : p.clicks / p.impressions;
    const typical = expectedCtr(p.position);
    const then = earlier.get(p.page);
    if (p.position >= r.nearPageOne.fromPosition && p.position <= r.nearPageOne.toPosition && p.impressions >= r.nearPageOne.minImpressions) {
      const gain = Math.max(0, p.impressions * (expectedCtr(Math.max(1, p.position - 4)) - ctr));
      const top = reader.gscPageQueries().filter((x) => x.page === p.page).sort((a, b) => b.impressions - a.impressions)[0];
      const q = top?.query;
      add({ id: `near:${p.page}`, kind: 'near-page-one', goal: 'ranking', page: p.page, query: q, look: `${p.page} ${q ?? ''}`, base: gain,
        headline: `Move ${p.page} onto page one${q === undefined ? '' : ` for "${q}"`}`,
        evidence: [`Ranks about ${p.position.toFixed(1)} on average and was shown ${n0(p.impressions)} times`, ...(q === undefined ? [] : [`Its biggest search: "${q}"`])],
        steps: [q === undefined ? 'Open the page and find the question it should answer best.' : `Put "${q}" in the title and the main heading if it is not there, and answer it in 40 to 60 words straight under a question heading.`, 'Add a short table or checklist if the search wants dates, steps or a comparison.', 'Link to this page from two or three related pages, using the searched words as the link text.', sig?.staleYear === true ? 'The page still mentions an old year: update it.' : 'Check every date and figure on the page is current.'],
        estimate: { text: `Roughly ${n0(gain)} more clicks a month if it moved up four places (an estimate from typical click rates)`, value: gain }, action: { type: 'rework', path: p.page, ...(q === undefined ? {} : { keyword: q }) } });
    }
    if (p.impressions >= r.lowClickRate.minImpressions && p.position <= r.lowClickRate.maxPosition && ctr < typical * r.lowClickRate.belowShareOfTypical) {
      const gain = p.impressions * (typical * 0.8 - ctr);
      add({ id: `ctr:${p.page}`, kind: 'low-click-rate', goal: 'visibility', page: p.page, query: undefined, look: p.page, base: gain,
        headline: `People see ${p.page} but few click it`,
        evidence: [`Shown ${n0(p.impressions)} times at about position ${p.position.toFixed(1)}`, `${pct(ctr)} clicked; pages at that position typically get about ${pct(typical)}`],
        steps: ['Rewrite the page title (under 60 characters) to promise the answer and name the exam.', 'Rewrite the description (140 to 158 characters) to say what the reader gets and the next step.', 'Leave the page address and the page text alone: this changes only how it looks in search results.'],
        estimate: { text: `Roughly ${n0(gain)} more clicks a month if the click rate reached about 80% of typical (an estimate)`, value: gain }, action: { type: 'rework', path: p.page } });
    }
    const v = visits.get(p.page) ?? 0;
    const l = leads.get(p.page) ?? 0;
    if (!NO_CONVERSION.test(p.page) && siteLeads > 0 && v >= r.noEnquiries.minVisits && l / v < siteRate * r.noEnquiries.belowShareOfSiteRate) {
      const gain = v * siteRate - l;
      add({ id: `conv:${p.page}`, kind: 'no-enquiries', goal: 'conversion', page: p.page, query: undefined, look: p.page, base: gain * 20,
        headline: `${p.page} gets visitors but few enquiries`,
        evidence: [`${n0(v)} visits, ${n0(l)} enquiries (${pct(v === 0 ? 0 : l / v)}); the site average is ${pct(siteRate)}`],
        steps: ['Add the exam\'s free resource card near the top and the demo class at the end (Offers on pages prepares a paste-in that only adds blocks).', 'Make sure the Call and WhatsApp buttons are visible without scrolling on a phone.', 'Do not change the page title, headings or text: adding a form must not change how the page ranks.'],
        estimate: { text: `About ${gain.toFixed(1)} more enquiries a month if it converted like your average page (an estimate)`, value: gain }, action: { type: 'offers', path: p.page } });
    }
    if (then !== undefined && then.clicks >= r.falling.minEarlierClicks && p.clicks < then.clicks * (1 - r.falling.dropPct / 100)) {
      const lost = then.clicks - p.clicks;
      add({ id: `fall:${p.page}`, kind: 'falling', goal: 'ranking', page: p.page, query: undefined, look: p.page, base: lost,
        headline: `${p.page} is losing clicks`,
        evidence: [`${n0(p.clicks)} clicks now against ${n0(then.clicks)} in the 28 days before (${n0(lost)} fewer)`, ...(sig?.staleYear === true ? ['The page still mentions an old year'] : [])],
        steps: ['Search for the page\'s main question yourself and read what ranks above it now.', 'Update dates, figures and the year; use live facts so they stay current.', 'Add what the better pages cover and this one does not.'],
        estimate: { text: `Up to ${n0(lost)} clicks a month to win back`, value: lost }, action: { type: 'rework', path: p.page } });
    }
  }

  // Searches the site does not answer well: group by exam and kind of question, so one new page answers several searches.
  const best = new Map<string, number>();
  for (const x of reader.gscPageQueries()) best.set(x.query, Math.min(best.get(x.query) ?? 999, x.position));
  const groups = new Map<string, { exam: string; intent: Intent; queries: { query: string; impressions: number }[] }>();
  for (const q of reader.gscTopQueries(from, to, 500)) {
    const exam = examOf(q.query);
    const intent = intentOf(q.query);
    if (exam === undefined || intent === undefined || isMoneyTopic(q.query)) continue;
    if ((best.get(q.query) ?? q.position) <= r.newPage.bestPositionWorseThan) continue;
    const key = `${exam}|${intent.id}`;
    const g = groups.get(key) ?? { exam, intent, queries: [] };
    g.queries.push({ query: q.query, impressions: q.impressions });
    groups.set(key, g);
  }
  const known = [...new Set([...input.knownPages, ...pages.map((p) => p.page)])];
  for (const [key, g] of groups) {
    const total = g.queries.reduce((a, b) => a + b.impressions, 0);
    if (total < r.newPage.minImpressions || hasPageFor(known, g.exam, g.intent)) continue;
    const top = [...g.queries].sort((a, b) => b.impressions - a.impressions).slice(0, 4);
    const title = `${g.exam} ${g.intent.phrase}`;
    const gain = total * 0.03;
    add({ id: `new:${key}`, kind: 'new-page', goal: 'new-content', page: undefined, query: top[0]?.query, look: `${g.exam} ${g.intent.phrase}`, base: gain,
      headline: `No page answers "${title}" yet`,
      evidence: [`People searched ${n0(total)} times for it in 28 days and found nothing on the site that ranks well`, `Searches: ${top.map((t) => `"${t.query}"`).join(', ')}`],
      steps: [`Write one page called "${title}" that answers these searches.`, 'Start with the direct answer, then use question headings, a table for dates or eligibility, and a short FAQ.', 'Use live facts for every date and figure, and link the page from related pages.'],
      estimate: { text: `Roughly ${n0(gain)} clicks a month once it ranks (an estimate)`, value: gain }, action: { type: 'new-post', keyword: `${g.exam.toLowerCase()} ${g.intent.keyword}`, topic: title, exam: g.exam } });
  }
  const items = out.sort((a, b) => b.score - a.score).slice(0, r.maxItems);
  return { enough: true, why: items.length === 0 ? 'Nothing stands out right now. The numbers do not show a page just off page one, a page few people click, or a gap in what the site answers.' : '', items };
}
