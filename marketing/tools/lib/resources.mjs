// The free-resource registry: which resource a comment keyword means, on which post, and what to send. The comment and DM agents
// never decide this themselves: they ask `match`. Also the gate that stops a post promising a resource that does not really exist.
import { guard } from './copy.mjs';

export const STATUSES = ['planned', 'copy-ready', 'made', 'in-drive', 'live', 'existing-unverified'];
export const PLATFORMS = ['instagram', 'youtube', 'gbp', 'blog'];
// Words a person might type for other reasons: never allowed as the trigger word.
const COMMON = new Set(['FREE', 'INFO', 'HELP', 'LINK', 'SEND', 'DEMO', 'GUIDE', 'YES', 'PLEASE', 'THANKS', 'THANK', 'HELLO', 'NIFT', 'NID', 'UCEED', 'CEED', 'NATA', 'JEE', 'DESIGN', 'COURSE', 'PDF', 'DETAILS', 'PRICE', 'FEES']);
const KEYWORD = /^[A-Z][A-Z0-9]{3,13}$/;
const OPT_OUT = /^\s*(stop|unsubscribe|opt[ -]?out|no thanks?|do not message|dont message|don't message)[\s.!]*$/i;

export const isOptOut = (text) => OPT_OUT.test(text ?? '');
export const resourceByKeyword = (reg, kw) => reg.resources.find((r) => r.keyword.toUpperCase() === String(kw ?? '').toUpperCase());
export const isLive = (r) => r.status === 'live' && r.linkTested === true && r.driveRegistered !== false;

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };

export function validateRegistry(reg, { rules, facts, siteUrl }) {
  const problems = []; const ids = new Set(); const kws = new Map();
  const g = (text, where) => { for (const m of guard(text ?? '', rules, facts).blocking) problems.push(`${where}: ${m}`); };
  for (const r of reg.resources ?? []) {
    const w = `Resource "${r.id}"`;
    if (!/^[a-z0-9-]+$/.test(r.id ?? '')) problems.push(`${w}: id must be lowercase letters, digits and hyphens (it is also the Drive "Resource ID" and the offer id).`);
    if (ids.has(r.id)) problems.push(`${w}: duplicate id.`); ids.add(r.id);
    if (!STATUSES.includes(r.status)) problems.push(`${w}: status must be one of ${STATUSES.join(', ')}.`);
    const kw = String(r.keyword ?? '').toUpperCase();
    if (!KEYWORD.test(kw)) problems.push(`${w}: keyword "${r.keyword}" must be 4 to 14 letters/digits starting with a letter (easy to type, hard to say by accident).`);
    else if (COMMON.has(kw)) problems.push(`${w}: keyword "${kw}" is a common word and would trigger by accident.`);
    if (kws.has(kw)) problems.push(`${w}: keyword "${kw}" is already used by "${kws.get(kw)}". Every keyword must mean exactly one resource.`); kws.set(kw, r.id);
    for (const [k, v] of [['title', r.title], ['promise', r.promise], ['description', r.description], ['dmText', r.dmText]]) g(v, `${w} ${k}`);
    if (r.status === 'live' || r.dmEnabled) {
      if (r.status !== 'live') problems.push(`${w}: dmEnabled is on but the resource is not live.`);
      if (hostOf(r.landingUrl) === '' || hostOf(r.landingUrl) !== hostOf(siteUrl)) problems.push(`${w}: landingUrl must be an https page on ${hostOf(siteUrl)}.`);
      if (!String(r.landingUrl ?? '').startsWith('https://')) problems.push(`${w}: landingUrl must start with https://.`);
      if (r.linkTested !== true || !r.linkTestedOn) problems.push(`${w}: the link has not been tested (linkTested and linkTestedOn are required).`);
      if (r.driveRegistered !== true && r.status === 'live' && r.existingPage !== true) problems.push(`${w}: the file is not registered in the Sheet's Resources tab (driveRegistered).`);
      if (r.dmEnabled && !String(r.dmText ?? '').includes('{link}')) problems.push(`${w}: dmText must contain {link}.`);
    }
  }
  for (const p of reg.placements ?? []) {
    const r = (reg.resources ?? []).find((x) => x.id === p.resourceId);
    const w = `Placement ${p.platform}/${p.postId}`;
    if (!r) { problems.push(`${w}: unknown resource "${p.resourceId}".`); continue; }
    if (!PLATFORMS.includes(p.platform)) problems.push(`${w}: platform must be one of ${PLATFORMS.join(', ')}.`);
    if (String(p.keyword ?? '').toUpperCase() !== r.keyword.toUpperCase()) problems.push(`${w}: keyword "${p.keyword}" does not match the resource's keyword "${r.keyword}".`);
    if (!p.postId) problems.push(`${w}: postId is required.`);
  }
  return problems;
}

// What does this comment mean? Never guesses: no placement, two keywords, or a resource that is not live all stop short of a send.
export function matchComment(reg, { platform, postId, text }) {
  const placements = (reg.placements ?? []).filter((p) => p.platform === platform && (String(p.postId) === String(postId) || (p.shortcode && String(p.shortcode) === String(postId))));
  if (placements.length === 0) return { action: 'none', reason: `No resource is registered for ${platform} post ${postId}.` };
  const tokens = new Set((String(text ?? '').toUpperCase().match(/[A-Z0-9]+/g)) ?? []);
  const hits = placements.filter((p) => tokens.has(String(p.keyword).toUpperCase()));
  if (hits.length === 0) return { action: 'none', reason: 'The comment does not contain a keyword for this post.' };
  if (new Set(hits.map((h) => h.resourceId)).size > 1) return { action: 'draft-only', reason: 'The comment contains keywords for more than one resource: ask the owner.', candidates: hits.map((h) => h.resourceId) };
  const r = resourceByKeyword(reg, hits[0].keyword);
  if (!r) return { action: 'none', reason: 'The keyword is registered on the post but its resource is missing.' };
  if (!isLive(r) || r.dmEnabled !== true) return { action: 'draft-only', reason: !isLive(r) ? `Resource "${r.id}" is ${r.status} (needs status live and a tested link before anything is sent).` : `DMs are not switched on for "${r.id}" (dmEnabled).`, resourceId: r.id };
  return { action: 'send-dm', resourceId: r.id, keyword: r.keyword.toUpperCase(), message: r.dmText.replaceAll('{link}', r.landingUrl), landingUrl: r.landingUrl };
}

// The send log keeps one DM per person per resource, and honours opt-outs for good.
export const alreadySent = (log, resourceId, person) => log.some((e) => e.resourceId === resourceId && e.person === person && e.action === 'sent');
export const optedOut = (log, person) => log.some((e) => e.person === person && e.action === 'opted-out');

// The blog's side card and offer blocks come from config/offers.json: resources whose file is in Drive (or live) are added there; hand-written offers are never touched.
export function syncOffers(reg, offersCfg, siteUrl) {
  const host = hostOf(siteUrl);
  const next = offersCfg.offers.filter((o) => !o.generatedFromResource);
  const added = [];
  for (const r of reg.resources) {
    // in-drive: the file is in the Sheet's Resources tab, so the blog form can already deliver it. live: the link is also tested.
    if (!['in-drive', 'live'].includes(r.status) || r.existingPage === true) continue;
    const path = r.landingUrl && hostOf(r.landingUrl) === host ? new URL(r.landingUrl).pathname : '';
    next.push({ id: r.id, kind: 'lead-magnet', title: r.title, promise: r.promise, button: r.button, exams: r.exam ? [r.exam] : [], deliverUrl: path, resourceId: r.id, generatedFromResource: true });
    added.push(r.id);
  }
  return { offers: { ...offersCfg, offers: next }, added };
}
