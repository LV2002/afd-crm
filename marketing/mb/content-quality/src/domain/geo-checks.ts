import type { Draft } from './brief.ts';
import { advisory, blocking, type Finding } from './finding.ts';
import { contains } from './markdown.ts';
import { similarity } from './similarity.ts';

// A local page that only swaps a place name is a doorway page: search engines demote it and readers get nothing. So a local page
// must use the official exam-centre list, must not read like a sibling page, and should say where our centres are.
export const SIBLING_LIMIT = 0.35;

export interface Sibling { readonly label: string; readonly body: string }

export function geoChecks(d: Draft, siblings: readonly Sibling[]): Finding[] {
  const geo = d.brief.geo;
  if (geo === undefined) return [];
  const out: Finding[] = [];
  if (geo.examCentreFactId !== undefined && !d.body.includes(`{{fact:${geo.examCentreFactId}}}`)) {
    out.push(blocking('geo-centres', `a local page must use the official list of exam centres: add {{fact:${geo.examCentreFactId}}} where you say where the exam is held`));
  }
  if (geo.onlineFactId !== undefined && !d.body.includes(`{{fact:${geo.onlineFactId}}}`)) {
    out.push(blocking('geo-online', `say that we also teach online: add {{fact:${geo.onlineFactId}}}. It is what a student far from a centre can join`));
  }
  for (const s of siblings) {
    const alike = similarity(d.body, s.body);
    if (alike >= SIBLING_LIMIT) out.push(blocking('geo-duplicate', `${String(Math.round(alike * 100))} percent of this page reads like "${s.label}". A local page must say something its sibling pages do not: ${geo.angle}`));
  }
  const named = geo.centres.filter((c) => c.relation !== 'further').map((c) => c.name);
  if (geo.tier !== 'india' && named.length > 0 && !named.some((n) => contains(d.body, n))) out.push(advisory('geo-our-centre', `say where our centre is: ${named.join(' or ')}`));
  if (geo.noNearbyCentre) {
    const missing = geo.centres.filter((c) => !contains(d.body, c.name)).map((c) => c.name);
    if (missing.length > 0) out.push(blocking('geo-both-options', `this district has no centre of ours, so offer the online programme or our centres, and name each centre (missing: ${missing.join(', ')})`));
  }
  return out;
}
