import { err, ok, type Result } from '@mb/platform';
import type { LeadFormsConfig } from './config.ts';
import type { CtaItem, CtaPlan } from './cta-plan.ts';
import { liveFactTag } from './live-facts.ts';
import { KIND_LABEL, formFor, thanksFor } from './offers.ts';
import { renderLeadForm } from './render-form.ts';

export interface RenderedCtas {
  readonly strip: string;
  readonly inline: readonly { readonly afterSection: number; readonly html: string }[];
  readonly closing: string;
  readonly sheet: string;
  readonly slide: string;
  // A bar pinned to the bottom of a phone screen (Call, WhatsApp, Call me back), for pages that do not use the article design.
  readonly bar: string;
}

const esc = (t: string): string => t.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
const say = (text: string, exam: string | undefined): string => text.replace(/\{exam\}/g, exam ?? 'design entrance');

// The deadline, tagged so its date stays live; the footer script turns "on 16 November 2026" into "in 21 days" while it is close.
const chip = (plan: CtaPlan): string => (plan.strip.deadline === undefined ? '' : `<span class="afd-chip">Registration closes <span data-afd-count="${esc(plan.strip.deadline.factId)}">on ${liveFactTag(plan.strip.deadline.factId, plan.strip.deadline.value)}</span></span>`);

const PLACE_LABEL: Record<string, string> = { 'inline-1': 'in the text', 'inline-2': 'in the text, second', 'inline-3': 'in the text, third', 'inline-4': 'in the text, fourth', closing: 'end of page', sheet: 'call back bar', slide: 'corner card' };

// Every block marks itself (data-afd-cta) so the footer script can personalise it and measure it, and every form it holds
// reports which block it came from, so the Leads screen can say which call to action brought each enquiry.
function block(plan: CtaPlan, it: CtaItem, forms: LeadFormsConfig, page: string): Result<string, string> {
  const form = renderLeadForm({
    config: forms, label: `${KIND_LABEL[it.offer.kind]}: ${PLACE_LABEL[it.id] ?? it.id}`, formId: `cta-${it.id}`, button: it.button,
    ...(plan.exam !== undefined && forms.exams.includes(plan.exam) ? { exam: plan.exam } : {}),
    ...formFor(it.offer, it.form), hidden: { ...formFor(it.offer, it.form).hidden, placement: it.id, cta_page: page, intent: plan.intent }, ...thanksFor(it.offer),
  });
  if (!form.ok) return err(form.error);
  const ret = plan.returning;
  const attrs = `data-afd-cta="${it.id}" data-placement="${it.id}" data-offer="${esc(it.offer.id)}" data-exam="${esc(plan.exam ?? '')}" data-ret-h="${esc(say(ret.headline, plan.exam))}" data-ret-b="${esc(say(ret.body, plan.exam))}" data-ret-btn="${esc(say(ret.button, plan.exam))}"`;
  const head = `<p class="afd-cta-h">${esc(it.headline)}</p><p class="afd-cta-b">${esc(it.body)}</p>`;
  if (it.id === 'sheet') return ok(`<div class="afd-sheet" ${attrs} hidden role="dialog" aria-label="Request a call back"><button type="button" class="afd-x" data-afd-close aria-label="Close">&times;</button>${head}${form.value}</div>`);
  if (it.id === 'slide') return ok(`<aside class="afd-slide" ${attrs} data-afd-after-scroll="${String(plan.slideIn.afterScrollPct)}" data-afd-after-seconds="${String(plan.slideIn.afterSeconds)}" data-afd-hide-days="${String(plan.slideIn.hideDays)}" hidden><button type="button" class="afd-x" data-afd-close aria-label="Close">&times;</button>${head}${form.value}</aside>`);
  return ok(`<aside class="afd-cta${it.id === 'closing' ? ' big' : ''}" ${attrs}>${head}${it.id === 'closing' || it.id === 'inline-1' ? chip(plan) : ''}${form.value}</aside>`);
}

export function renderCtas(plan: CtaPlan, forms: LeadFormsConfig, page: string): Result<RenderedCtas, string> {
  const items = [...plan.inline.map((x) => x.item), plan.closing, plan.sheet, ...(plan.slide === undefined ? [] : [plan.slide])];
  const built = new Map<string, string>();
  for (const it of items) {
    const r = block(plan, it, forms, page);
    if (!r.ok) return r;
    built.set(it.id, r.value);
  }
  const s = plan.strip;
  const strip = `<div class="afd-strip" data-afd-cta="strip" data-placement="strip" data-exam="${esc(plan.exam ?? '')}"><p class="afd-strip-t">${esc(s.text)} ${chip(plan)}</p><div class="afd-strip-a"><a class="afd-b wa" href="${esc(s.whatsappUrl)}" data-afd-act="whatsapp">Ask on WhatsApp</a><a class="afd-b" href="${esc(s.callUrl)}" data-afd-act="call">${esc(s.callLabel)}</a></div></div>`;
  const bar = `<div class="afd-bar" data-afd-cta="bar" data-placement="bar" data-exam="${esc(plan.exam ?? '')}"><a class="afd-b" href="${esc(s.callUrl)}" data-afd-act="call">${esc(s.callLabel)}</a><a class="afd-b wa" href="${esc(s.whatsappUrl)}" data-afd-act="whatsapp">WhatsApp</a>${built.get('sheet') === undefined ? '' : '<button type="button" class="afd-b go" data-afd-open="sheet">Call me back</button>'}</div>`;
  return ok({ bar, strip, inline: plan.inline.map((x) => ({ afterSection: x.afterSection, html: built.get(x.item.id) ?? '' })), closing: built.get('closing') ?? '', sheet: built.get('sheet') ?? '', slide: built.get('slide') ?? '' });
}
