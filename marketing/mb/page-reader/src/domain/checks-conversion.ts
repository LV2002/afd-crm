import { fail, ok, warn, type Check } from './audit.ts';

const LAST_TEN = (n: string): string => n.replace(/\D/g, '').slice(-10);

export const conversionChecks: readonly Check[] = [
  (p) => {
    const lead = p.forms.filter((f) => f.hasPhone);
    return lead.length === 0 ? fail('lead-form', 'conversion', 'No enquiry form with a phone number field.', 'Add the enquiry form (name, phone, email, exam).') : ok('lead-form', 'conversion', `${String(lead.length)} enquiry form(s).`);
  },
  (p) => (p.forms.some((f) => f.hasPhone) ? (p.leadScript ? ok('lead-script', 'conversion', 'Our form script is on the page.') : warn('lead-script', 'conversion', 'Our form script is not on this page, so leads from it carry no page, form or campaign details.', 'Paste the footer script (Paste into Knorish, footer script).')) : undefined),
  (p) => {
    const first = p.forms.find((f) => f.hasPhone);
    return first !== undefined && first.textOffsetShare > 0.7 ? warn('form-position', 'conversion', 'The first form sits in the last third of the page.', 'Add a call to action nearer the top.') : undefined;
  },
  (p) => {
    const missing = [p.telLinks.length === 0 ? 'a tap-to-call link' : '', p.whatsappLinks.length === 0 ? 'a WhatsApp link' : ''].filter((x) => x !== '');
    return missing.length > 0 ? warn('call-whatsapp', 'conversion', `No ${missing.join(' or ')}.`, 'Add them near the top; most students use WhatsApp.') : ok('call-whatsapp', 'conversion', 'Call and WhatsApp links present.');
  },
  (p, ctx) => {
    const known = new Set(ctx.knownPhones.map(LAST_TEN));
    const stray = p.phoneNumbers.filter((n) => !known.has(n));
    return stray.length > 0 ? fail('phone-numbers', 'conversion', `Phone or WhatsApp number(s) that are not ours: ${stray.join(', ')}.`, 'Replace with the Kochi or Kannur number from the contact settings.') : ok('phone-numbers', 'conversion', 'All numbers on the page are ours.');
  },
  (p) => (/^\/(publisher|user)(\/|$)/i.test(p.path) && p.forms.some((f) => f.hasPhone) ? warn('protected-path', 'conversion', 'This address is under /publisher or /user, where we never add conversion actions.', 'Leave it unchanged.') : undefined),
];
