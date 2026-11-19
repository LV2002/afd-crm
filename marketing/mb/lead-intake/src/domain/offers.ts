import { err, ok, type Result } from '@mb/platform';
import { z } from 'zod';
import type { LeadFormsConfig } from './config.ts';
import { liveFactTag } from './live-facts.ts';
import { renderLeadForm } from './render-form.ts';

export const LOOKS = ['red', 'black', 'green', 'paper'] as const;
export type OfferLook = (typeof LOOKS)[number];
const KINDS = ['demo-class', 'lead-magnet', 'career-call', 'webinar', 'scholarship-test', 'mock-test', 'cutoff-calculator'] as const;
export const KIND_LABEL: Record<(typeof KINDS)[number], string> = {
  'demo-class': 'Demo class', 'lead-magnet': 'Free resource', 'career-call': 'Career call', webinar: 'Webinar', 'scholarship-test': 'Scholarship test', 'mock-test': 'Mock test', 'cutoff-calculator': 'Cutoff calculator',
};

export const OfferSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(KINDS),
  title: z.string().min(3),
  promise: z.string().min(10),
  button: z.string().min(3),
  // Exams this offer suits (empty means all).
  exams: z.array(z.string()),
  // Where the visitor goes after sending their details (a resource or tool already on the site). Empty for a call back.
  deliverUrl: z.string(),
  // A file kept private in Drive and listed in the Apps Script "Resources" tab under this short name. The visitor gives name, phone and email,
  // then gets a private link that opens in a new tab, expires, and cannot be passed round. Empty when the offer has no file.
  resourceId: z.string().regex(/^[a-z0-9-]*$/).default(''),
  // How the block looks. Unset, each offer takes the next look in turn so neighbouring offers never look alike.
  look: z.enum(LOOKS).optional(),
});
export type Offer = z.infer<typeof OfferSchema>;

export const OffersConfigSchema = z.object({
  offers: z.array(OfferSchema).min(1),
  // Fact id of each exam's registration deadline, used for the honest "registration closes on" line.
  deadlineFacts: z.array(z.object({ exam: z.string(), factId: z.string() })),
});
export type OffersConfig = z.infer<typeof OffersConfigSchema>;

// 'rail' is the card beside an article; the writer cannot place it, the page builder does.
export type Placement = 'top' | 'middle' | 'closing' | 'rail';

export interface OfferContext {
  readonly forms: LeadFormsConfig;
  // Facts the app may state, keyed by id, with an optional yyyy-mm-dd date; and today's date in India.
  readonly facts: ReadonlyMap<string, { readonly value: string; readonly date?: string | undefined; readonly usable: boolean }>;
  readonly today: string;
}

// What the visitor sees after sending: the resource link if there is one, else the usual call-back message.
export const thanksFor = (offer: Offer): { thanks?: { text: string; linkText?: string; linkUrl?: string } } => {
  if (offer.kind === 'scholarship-test') return { thanks: { text: 'Application received. We will be in touch shortly.' } };
  if (offer.resourceId !== '') return { thanks: { text: 'Thank you, we have your details.' } };
  return offer.deliverUrl === '' ? {} : { thanks: { text: 'Thank you. Your resource is ready.', linkText: 'Open it now', linkUrl: offer.deliverUrl } };
};

// The form fields an offer needs. A private file asks for an email too, because the visitor is keeping something.
export const formFor = (offer: Offer, fallback: 'full' | 'short' | undefined): { fields?: 'full' | 'short' | 'resource' | 'contact'; openLabel?: string; hidden: Record<string, string> } => ({
  ...(offer.kind === 'scholarship-test' ? { fields: 'contact' as const } : offer.resourceId !== '' ? { fields: 'resource' as const, openLabel: 'Open my download' } : fallback === undefined ? {} : { fields: fallback }),
  hidden: { offer: offer.id, resource: offer.deliverUrl, ...(offer.resourceId === '' ? {} : { resource_id: offer.resourceId }), ...(offer.kind === 'scholarship-test' ? { formType: 'Scholarship (AFDSAT)' } : {}) },
});

// Offers rotate through the looks in the order they are listed, unless one is chosen, so a page with two offers never shows two of a kind.
export const lookOf = (offer: Offer, config: OffersConfig): OfferLook => offer.look ?? LOOKS[Math.max(0, config.offers.findIndex((o) => o.id === offer.id)) % LOOKS.length] ?? 'red';

const KICKER: Record<(typeof KINDS)[number], string> = {
  'demo-class': 'Free demo class', 'lead-magnet': 'Free download', 'career-call': 'Free career call', webinar: 'Free webinar', 'scholarship-test': 'Scholarship test', 'mock-test': 'Free mock test', 'cutoff-calculator': 'Free calculator',
};

// Offers are added to a page, never woven into it: no headings, no scripts, no styles, nothing a search engine would read as page content.
// How big a block is drawn: 'l' fills a page of its own, 'm' sits between sections, 's' fits a narrow column such as a footer.
export type OfferSize = 's' | 'm' | 'l';

export function renderOffer(offer: Offer, placement: Placement, exam: string | undefined, config: OffersConfig, ctx: OfferContext, opts: { size?: OfferSize; look?: OfferLook } = {}): Result<string, string> {
  const factId = config.deadlineFacts.find((d) => d.exam === exam)?.factId;
  const fact = factId === undefined ? undefined : ctx.facts.get(factId);
  const deadline = fact !== undefined && fact.usable && fact.date !== undefined && fact.date >= ctx.today ? fact.value : undefined;
  const form = renderLeadForm({
    config: ctx.forms, label: `${KIND_LABEL[offer.kind]}: ${offer.title}`, formId: `offer-${offer.id}-${placement}`, button: placement === 'rail' ? 'Submit' : offer.button, ...(placement === 'rail' ? { compact: true } : {}),
    ...(exam !== undefined && ctx.forms.exams.includes(exam) ? { exam } : {}),
    ...formFor(offer, undefined),
    ...thanksFor(offer),
  });
  if (!form.ok) return err(form.error);
  const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => `&#${String(c.charCodeAt(0))};`);
  return ok(`<div class="afd-offer afd-look-${opts.look ?? lookOf(offer, config)}${opts.size === undefined || opts.size === 'l' ? '' : ` afd-size-${opts.size}`}" data-afd-offer="${offer.id}" data-afd-placement="${placement}" data-afd-kicker="${esc(KICKER[offer.kind])}"><p class="afd-offer-title"><strong>${esc(offer.title)}</strong></p><p>${esc(offer.promise)}</p>${deadline === undefined || factId === undefined ? '' : `<p class="afd-offer-deadline">Registration closes on ${liveFactTag(factId, deadline)}.</p>`}${placement === 'rail' ? `<details class="afd-drop"><summary>${esc(offer.button)}</summary>${form.value}</details>` : form.value}</div>`);
}

export function inferExam(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/uceed/.test(t)) return 'UCEED';
  if (/\bceed\b/.test(t)) return 'CEED';
  if (/\bnid\b|nid-/.test(t)) return 'NID';
  if (/nift/.test(t)) return 'NIFT';
  if (/nata|barch|architecture/.test(t)) return 'NATA';
  if (/jee/.test(t)) return 'JEE Paper 2';
  return undefined;
}

// The funnel decision: a demo class leads on coaching pages; guide posts first offer the exam's free resource and close with the demo class.
export function recommendOffers(input: { kind: 'blog' | 'page'; exam: string | undefined }, config: OffersConfig): { placement: Placement; offerId: string }[] {
  const byKind = (kind: Offer['kind']): Offer | undefined => config.offers.find((o) => o.kind === kind && (o.exams.length === 0 || (input.exam !== undefined && o.exams.includes(input.exam))));
  const magnet = byKind('lead-magnet') ?? config.offers.find((o) => o.kind === 'lead-magnet');
  const demo = config.offers.find((o) => o.kind === 'demo-class');
  const call = config.offers.find((o) => o.kind === 'career-call');
  const picks: [Placement, Offer | undefined][] = input.kind === 'blog'
    ? [['middle', magnet], ['closing', demo]]
    : [['top', demo], ['closing', magnet ?? call]];
  return picks.flatMap(([placement, offer]) => (offer === undefined ? [] : [{ placement, offerId: offer.id }]));
}
