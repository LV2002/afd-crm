import { marked } from 'marked';
import { renderLeadForm, renderOffer, type LeadFormsConfig, type OfferContext, type OffersConfig, type Placement } from '@mb/lead-intake';
import { err, ok, type Result } from '@mb/platform';

const FORM_TOKEN = /^\{\{form:([^}]+)\}\}$/gm;
// A line holding only the placeholder; a trailing note in brackets (which a writer sometimes adds) is ignored.
const OFFER_TOKEN = /^\{\{offer:([a-z0-9-]+)(?:@(top|middle|closing))?\}\}(?:[ \t]*\([^)\n]*\))?[ \t]*$/gm;

// A line holding only {{tool:age-nid}} becomes that free tool's block (only tools whose fact is confirmed are given).
const TOOL_TOKEN = /^\{\{tool:([a-z0-9-]+)\}\}[ \t]*$/gm;

export interface OfferSetup {
  readonly config: OffersConfig;
  readonly ctx: OfferContext;
  readonly exam: string | undefined;
}
const stripTags = (html: string): string => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export interface RenderedBody {
  readonly html: string;
  // Question headings with their first paragraph, for the FAQ markup.
  readonly qa: readonly { readonly question: string; readonly answer: string }[];
}

// Markdown (already filled with facts) to the HTML block pasted into Knorish: markup only, no styles, no scripts.
// A line holding only {{form:Book a demo}} becomes the enquiry form with that label.
export function renderBody(markdown: string, forms: LeadFormsConfig, offers?: OfferSetup, tools?: ReadonlyMap<string, string>): Result<RenderedBody, string[]> {
  const problems: string[] = [];
  let n = 0;
  const withForms = markdown.replace(FORM_TOKEN, (_whole, label: string) => {
    n++;
    const r = renderLeadForm({ config: forms, label: label.trim(), formId: `lead${String(n)}` });
    if (!r.ok) { problems.push(r.error); return ''; }
    return `\n\n<!--form-->${r.value}<!--/form-->\n\n`;
  });
  const withOffers = withForms.replace(OFFER_TOKEN, (_whole, id: string, placement: string | undefined) => {
    const offer = offers?.config.offers.find((o) => o.id === id);
    if (offers === undefined || offer === undefined) { problems.push(`unknown offer "${id}"`); return ''; }
    const r = renderOffer(offer, (placement ?? 'middle') as Placement, offers.exam, offers.config, offers.ctx);
    if (!r.ok) { problems.push(r.error); return ''; }
    return `\n\n<!--offer-->${r.value}<!--/offer-->\n\n`;
  });
  const withTools = withOffers.replace(TOOL_TOKEN, (_whole, id: string) => {
    const block = tools?.get(id);
    if (block === undefined) { problems.push(`the tool "${id}" is not available (unknown, or its fact is not confirmed)`); return ''; }
    return `\n\n<!--tool-->${block}<!--/tool-->\n\n`;
  });
  const html = marked.parse(withTools, { async: false, gfm: true });
  const images = [...html.matchAll(/<img\b[^>]*>/g)].filter((m) => !/\balt="[^"]+"/.test(m[0]));
  if (images.length > 0) problems.push(`${String(images.length)} image(s) without alt text`);
  if (html.includes('{{')) problems.push('a placeholder was left in the text (it is not on a line of its own, or its name is wrong)');
  if (problems.length > 0) return err(problems);

  const qa: { question: string; answer: string }[] = [];
  for (const m of html.matchAll(/<h2[^>]*>(.*?)<\/h2>\s*<p>(.*?)<\/p>/gs)) {
    const question = stripTags(m[1] ?? '');
    if (/\?$/.test(question)) qa.push({ question, answer: stripTags(m[2] ?? '') });
  }
  for (const m of html.matchAll(/<h3[^>]*>(.*?)<\/h3>\s*<p>(.*?)<\/p>/gs)) {
    const question = stripTags(m[1] ?? '');
    if (/\?$/.test(question)) qa.push({ question, answer: stripTags(m[2] ?? '') });
  }
  return ok({ html, qa });
}

// Anything that could run code or restyle the page is refused: Knorish gets markup and nothing else.
export function bodyProblems(html: string): string[] {
  const out: string[] = [];
  if (/<script\b/i.test(html)) out.push('the body contains a script');
  if (/<style\b|\sstyle\s*=/i.test(html)) out.push('the body contains styling');
  if (/\son[a-z]+\s*=/i.test(html)) out.push('the body contains an event handler');
  if (/javascript:/i.test(html)) out.push('the body contains a javascript: link');
  // The one frame allowed is Google's own map embed, which a centre's card carries; any other frame is refused.
  for (const frame of html.matchAll(/<iframe\b[^>]*>/gi)) if (!/\ssrc="https:\/\/www\.google\.com\/maps\/embed\?[^"]*"/i.test(frame[0])) out.push('the body contains an iframe that is not a Google map');
  return out;
}
