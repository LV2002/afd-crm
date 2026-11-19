import type { LeadFormsConfig } from './config.ts';
import type { CtaPlaybook, IntentCopy } from './cta-playbook.ts';
import type { Offer, OffersConfig, OfferContext } from './offers.ts';

export type CtaPlacement = 'inline-1' | 'inline-2' | 'inline-3' | 'inline-4' | 'closing' | 'sheet' | 'slide';

export interface CtaItem {
  readonly id: CtaPlacement;
  readonly offer: Offer;
  readonly headline: string;
  readonly body: string;
  readonly button: string;
  readonly form: 'short' | 'full';
}

export interface CtaPlan {
  readonly exam: string | undefined;
  readonly intent: string;
  readonly strip: { readonly text: string; readonly whatsappUrl: string; readonly callUrl: string; readonly callLabel: string; readonly deadline: { readonly factId: string; readonly value: string } | undefined };
  // afterSection counts the numbered sections of the article (1 is after the first).
  readonly inline: readonly { readonly afterSection: number; readonly item: CtaItem }[];
  readonly closing: CtaItem;
  readonly sheet: CtaItem;
  readonly slide: CtaItem | undefined;
  readonly returning: CtaPlaybook['returning'];
  readonly slideIn: CtaPlaybook['slideIn'];
}

export interface CtaInput {
  readonly title: string;
  readonly exam: string | undefined;
  readonly intent: string | undefined;
  readonly sections: number;
  readonly offers: OffersConfig;
  readonly ctx: OfferContext;
  readonly playbook: CtaPlaybook;
}

const say = (text: string, exam: string | undefined): string => text.replace(/\{exam\}/g, exam ?? 'design entrance');

// The offer of a kind that suits the exam (an exam-specific resource first), else any of that kind, else the demo class.
function pick(kind: Offer['kind'], exam: string | undefined, offers: OffersConfig): Offer | undefined {
  const fits = (o: Offer): boolean => o.exams.length === 0 || (exam !== undefined && o.exams.includes(exam));
  return offers.offers.find((o) => o.kind === kind && fits(o)) ?? offers.offers.find((o) => o.kind === kind) ?? offers.offers.find((o) => o.kind === 'demo-class') ?? offers.offers[0];
}

// A second, different offer for the next card, so a long page does not repeat itself.
const ALTERNATE: Record<Offer['kind'], Offer['kind']> = { 'demo-class': 'lead-magnet', 'lead-magnet': 'demo-class', 'career-call': 'demo-class', webinar: 'career-call', 'scholarship-test': 'demo-class', 'mock-test': 'demo-class', 'cutoff-calculator': 'career-call' };

export function planCtas(i: CtaInput): CtaPlan | undefined {
  const { playbook: pb, exam, offers } = i;
  const copy: IntentCopy | undefined = pb.intents[i.intent ?? 'general'] ?? pb.intents['general'];
  const centre = (id: string, forms: LeadFormsConfig): LeadFormsConfig['centres'][number] | undefined => forms.centres.find((c) => c.id === id);
  const home = centre(i.ctx.forms.primaryCentreId, i.ctx.forms);
  const lead = copy === undefined ? undefined : pick(copy.offerKind, exam, offers);
  if (copy === undefined || home === undefined || lead === undefined) return undefined;

  const item = (id: CtaPlacement, offer: Offer, form: CtaItem['form'], over: Partial<Pick<CtaItem, 'headline' | 'body' | 'button'>> = {}): CtaItem =>
    ({ id, offer, form, headline: say(over.headline ?? copy.headline, exam), body: say(over.body ?? copy.body, exam), button: say(over.button ?? copy.button, exam) });
  const second = pick(ALTERNATE[lead.kind], exam, offers) ?? lead;
  // Everyone gets a call back option in the bottom sheet and the corner card; a resource card goes where one exists for the exam.
  const call = pick('career-call', exam, offers) ?? lead;
  const magnet = pick('lead-magnet', exam, offers);
  const wa = (exam === undefined ? pb.whatsappNoExam : pb.whatsappWithExam).replace(/\{title\}/g, i.title).replace(/\{exam\}/g, exam ?? '');
  const factId = offers.deadlineFacts.find((d) => d.exam === exam)?.factId;
  const fact = factId === undefined ? undefined : i.ctx.facts.get(factId);
  const live = fact !== undefined && fact.usable && fact.date !== undefined && fact.date >= i.ctx.today;

  const slots: number[] = [];
  for (let n = pb.inline.firstAfterSection; n < i.sections && slots.length < pb.inline.max; n += pb.inline.everyNSections) slots.push(n);
  const inline = slots.map((afterSection, k) => ({ afterSection, item: item(`inline-${String(k + 1)}` as CtaPlacement, k % 2 === 0 ? lead : second, 'short', k % 2 === 0 ? {} : second.kind === 'lead-magnet' ? { headline: `Get the free ${second.title.toLowerCase()}`, body: second.promise, button: second.button } : { headline: second.title, body: second.promise, button: second.button }) }));

  return {
    exam, intent: i.intent ?? 'general', returning: pb.returning, slideIn: pb.slideIn,
    strip: { text: say(copy.strip, exam), whatsappUrl: `https://wa.me/${home.whatsapp}?text=${encodeURIComponent(wa)}`, callUrl: `tel:${home.phone}`, callLabel: `Call ${home.name}`, deadline: live && factId !== undefined ? { factId, value: fact.value } : undefined },
    inline, closing: item('closing', lead, 'full'),
    sheet: item('sheet', call, 'short', { headline: 'Request a call back', body: 'Share your name and number. A mentor will call you.', button: 'Call me back' }),
    slide: pb.slideIn.enabled ? item('slide', magnet ?? lead, 'short', magnet === undefined ? {} : { headline: magnet.title, body: magnet.promise, button: magnet.button }) : undefined,
  };
}
