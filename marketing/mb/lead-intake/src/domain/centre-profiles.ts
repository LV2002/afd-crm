import { z } from 'zod';
import type { LeadFormsConfig } from './config.ts';

// Where each centre is, as Google knows it. Filled in from the centre's own Google Business Profile (nothing here is guessed):
// the Maps link, the "Embed a map" address, the street address. Empty fields are simply left out of the page.
const MAPS_LINK = /^https:\/\/(www\.google\.com\/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page|share\.google)\S*$/;
// Only Google's own map embed address is ever put in a page, so a typo or a pasted link to somewhere else cannot become a frame.
export const MAPS_EMBED = /^https:\/\/www\.google\.com\/maps\/embed\?\S+$/;
const emptyOr = (re: RegExp, message: string) => z.string().refine((v) => v === '' || re.test(v), message);

export const CentreProfileSchema = z.object({
  id: z.string().min(1),
  streetAddress: z.string(),
  locality: z.string(),
  postalCode: z.string().regex(/^(\d{6})?$/, 'six digits, or empty'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  mapsUrl: emptyOr(MAPS_LINK, 'a Google Maps or Business Profile link, or empty'),
  mapEmbedUrl: emptyOr(MAPS_EMBED, 'the address from Share > Embed a map (starts https://www.google.com/maps/embed?), or empty'),
  reviewsUrl: emptyOr(/^https:\/\/\S+$/, 'an https link, or empty'),
  openingHours: z.string(),
});
export type CentreProfile = z.infer<typeof CentreProfileSchema>;

export const CentresConfigSchema = z.object({ centres: z.array(CentreProfileSchema) });
export type CentresConfig = z.infer<typeof CentresConfigSchema>;

const esc = (t: string): string => t.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
const hasPlace = (p: CentreProfile): boolean => p.streetAddress !== '' || p.mapsUrl !== '' || p.mapEmbedUrl !== '';

// "Visit our centres": one card per centre with its map, address, and call, WhatsApp, directions and reviews links. A local page puts the
// nearest centre first. Nothing is shown for a centre that has no place details yet, and nothing at all if none has.
export function renderCentresBlock(profiles: CentresConfig, forms: LeadFormsConfig, order: readonly string[] = []): string {
  const rank = (name: string): number => { const i = order.indexOf(name); return i === -1 ? order.length : i; };
  const cards = [...forms.centres].sort((a, b) => rank(a.name) - rank(b.name)).flatMap((c) => {
    const p = profiles.centres.find((x) => x.id === c.id);
    if (p === undefined || !hasPlace(p)) return [];
    const address = [p.streetAddress, p.locality, p.postalCode].filter((x) => x !== '').join(', ');
    return [`<div class="ap-centre"><p class="ap-centre-n">${esc(c.name)}</p>${address === '' ? '' : `<p class="ap-centre-a">${esc(address)}</p>`}${p.openingHours === '' ? '' : `<p class="ap-centre-h">${esc(p.openingHours)}</p>`}`
      + `<div class="ap-acts"><a class="ap-btn ap-a" href="tel:${esc(c.phone)}">Call ${esc(c.name)}</a><a class="ap-btn ap-w" href="https://wa.me/${esc(c.whatsapp)}">WhatsApp</a>${p.mapsUrl === '' ? '' : `<a class="ap-btn ap-g" href="${esc(p.mapsUrl)}" rel="noopener">Open in Google Maps</a>`}${p.reviewsUrl === '' ? '' : `<a class="ap-btn ap-g" href="${esc(p.reviewsUrl)}" rel="noopener">Read reviews</a>`}</div>`
      + `${p.mapEmbedUrl === '' ? '' : `<iframe class="ap-map" src="${esc(p.mapEmbedUrl)}" title="AFD India ${esc(c.name)} on Google Maps" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`}</div>`];
  });
  return cards.length === 0 ? '' : `<section class="ap-centres" aria-label="Our centres"><h2>Visit our centres</h2><div class="ap-centre-grid">${cards.join('')}</div></section>`;
}
