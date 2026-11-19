import { err, ok, type Result } from '@mb/platform';
import type { LeadFormsConfig } from './config.ts';

export interface LeadFormOptions {
  readonly config: LeadFormsConfig;
  // Readable name for reports, e.g. "Book a demo". The CRM shows it after the page.
  readonly label: string;
  // Unique on the page so two forms never share element ids.
  readonly formId: string;
  // Pre-selects the exam on exam-specific pages.
  readonly exam?: string;
  // Extra values sent with the enquiry (which offer, which resource), so reports can tell them apart.
  readonly hidden?: Readonly<Record<string, string>>;
  readonly button?: string;
  // A narrow, single-column form for a side rail.
  readonly compact?: boolean;
  // 'short' asks only for a name and a phone number (the exam is taken from the page): fewer fields, more people finish.
  // 'resource' asks for name, phone and a required email (the resource is for the visitor to keep), with the exam taken from the page.
  // 'contact' asks only for name, phone and a required email: nothing about an exam (the scholarship test).
  readonly fields?: 'full' | 'short' | 'resource' | 'contact';
  // Text of the big button that opens the private download link after sending.
  readonly openLabel?: string;
  // What the visitor sees after sending. Defaults to a counsellor call-back message.
  readonly thanks?: { readonly text: string; readonly linkText?: string; readonly linkUrl?: string };
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

// Plain, unstyled markup: the design system styles it. Page, page address and campaign details are added
// in the browser by the footer script, so the same HTML works on any page.
export function renderLeadForm(o: LeadFormOptions): Result<string, string> {
  const { config, label, formId, exam } = o;
  const hidden = Object.entries(o.hidden ?? {}).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
  if (config.endpoint === '') return err('endpoint is empty: deploy the Apps Script and put its address in config/lead-forms.json');
  if (exam !== undefined && !config.exams.includes(exam)) return err(`exam not in the configured list: ${exam}`);
  const centre = config.centres.find((c) => c.id === config.primaryCentreId);
  if (centre === undefined) return err('primary centre missing');
  const options = config.exams
    .map((x) => `<option value="${esc(x)}"${x === exam ? ' selected' : ''}>${esc(x)}</option>`)
    .join('');
  const pick = exam === undefined ? '<option value="" selected disabled>Choose your exam</option>' : '';
  const wa = `https://wa.me/${centre.whatsapp}?text=${encodeURIComponent('Hi, I just sent an enquiry on afdindia.com.')}`;
  return ok(
    `<div class="afd-lead${o.compact === true || o.fields === 'short' ? ' compact' : ''}${o.fields === 'short' ? ' short' : ''}">` +
      `<form data-afd-lead data-crm-form="${esc(label)}" data-endpoint="${esc(config.endpoint)}"${o.openLabel === undefined ? '' : ` data-afd-open-label="${esc(o.openLabel)}"`}>` +
      `<div><label for="${formId}-name">Your name</label><input id="${formId}-name" name="name" autocomplete="name" required maxlength="80"></div>` +
      `<div><label for="${formId}-phone">Phone (WhatsApp)</label><input id="${formId}-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" required maxlength="10" pattern="[0-9]{10}" title="A 10 digit mobile number"></div>` +
      (o.fields === 'short' ? '' : `<div><label for="${formId}-email">Email${o.fields === 'resource' || o.fields === 'contact' ? '' : ' <small>(optional)</small>'}</label><input id="${formId}-email" name="email" type="email" autocomplete="email" maxlength="120"${o.fields === 'resource' || o.fields === 'contact' ? ' required' : ''}></div>`) +
      (o.fields === 'contact' ? '' : (o.fields === 'short' || o.fields === 'resource') && exam !== undefined
        ? `<input type="hidden" name="exam" value="${esc(exam)}">`
        : `<div><label for="${formId}-exam">${o.fields === 'short' ? 'Your exam' : 'Exam you are preparing for'}</label><select id="${formId}-exam" name="exam"${o.fields === 'short' ? '' : ' required'}>${pick}${options}</select></div>`) +
      `<div hidden aria-hidden="true"><label>Leave this empty<input name="company_website" tabindex="-1" autocomplete="off"></label></div>` +
      `${hidden}<button type="submit">${esc(o.button ?? 'Request a call back')}</button>` +
      `</form>` +
      `<p data-afd-error role="alert" hidden></p>` +
      `<div data-afd-thanks hidden><p>${esc(o.thanks?.text ?? 'Thank you, we have your details. A counsellor will call you.')}</p>` +
      (o.thanks?.linkUrl === undefined ? '' : `<p><a href="${esc(o.thanks.linkUrl)}">${esc(o.thanks.linkText ?? 'Open it now')}</a></p>`) +
      `<p><a href="${wa}">WhatsApp ${esc(centre.name)} now</a> or call <a href="tel:${esc(centre.phone)}">${esc(centre.phone)}</a>.</p></div>` +
      `</div>`,
  );
}
