// Parse, check and resolve a carousel draft. Pure functions, no I/O except readFileSync in load helpers.
import { readFileSync } from 'node:fs';

export const ROLES = ['hook', 'content', 'reference', 'summary', 'cta'];
const DASH = /[–—]/;

export function parseDraft(text) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const meta = {};
  if (fm) for (const line of fm[1].split('\n')) { const m = /^([A-Za-z_]+):\s*(.*)$/.exec(line); if (m) meta[m[1]] = m[2].trim(); }
  const body = fm ? text.slice(fm[0].length) : text;
  const j = /```json\n([\s\S]*?)\n```/.exec(body);
  if (!j) throw new Error('No ```json block found in the draft.');
  let carousel;
  try { carousel = JSON.parse(j[1]); } catch (e) { throw new Error(`The JSON block is not valid JSON: ${e.message}`); }
  return { meta, carousel };
}

export function loadFacts(path) {
  const f = JSON.parse(readFileSync(path, 'utf8'));
  const list = Array.isArray(f) ? f : f.facts;
  return new Map(list.filter((x) => x.status === 'official' || x.status === 'owner_verified').map((x) => [x.id, x]));
}

const PLACEHOLDER = /\{\{fact:([a-z0-9-]+)\}\}/g;

// Replace {{fact:id}} with its value. Unknown ids are problems, never guessed.
export function resolveFacts(str, facts, problems, where) {
  return str.replace(PLACEHOLDER, (_, id) => {
    const f = facts.get(id);
    if (!f) { problems.push(`${where}: fact "${id}" is not an official or owner-verified fact in facts.json.`); return `[${id}]`; }
    return f.value;
  });
}

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

// Returns { blocking: string[], advisory: string[] } using the contract in context/content-playbook.md.
export function lintCarousel(c, rules, facts) {
  const blocking = []; const advisory = [];
  const slides = Array.isArray(c.slides) ? c.slides : [];
  if (slides.length < 5) blocking.push(`Only ${slides.length} slides; at least 5 are required (7 to 10 is the target).`);
  else if (slides.length < 7) advisory.push(`${slides.length} slides; 7 to 10 is the target.`);
  if (slides.length > 10) blocking.push(`${slides.length} slides; Instagram allows at most 10.`);
  if (slides[0]?.role !== 'hook') blocking.push('Slide 1 must have role "hook".');
  if (slides.length >= 2 && slides.at(-2)?.role !== 'summary') blocking.push('The second to last slide must have role "summary".');
  if (slides.at(-1)?.role !== 'cta') blocking.push('The last slide must have role "cta".');
  if (slides.filter((s) => s.role === 'cta').length !== 1) blocking.push('There must be exactly one "cta" slide.');
  if (!slides.some((s) => s.role === 'reference')) blocking.push('At least one slide must have role "reference".');
  const hook = slides[0];
  if (hook) {
    if (words(hook.title ?? '') > 8) blocking.push(`Hook is ${words(hook.title)} words; the maximum is 8.`);
    if (!/\d/.test(hook.title ?? '')) blocking.push('The hook title must contain a number.');
  }
  const all = [];
  slides.forEach((s, i) => {
    const n = i + 1;
    if (!ROLES.includes(s.role)) blocking.push(`Slide ${n}: unknown role "${s.role}".`);
    if (typeof s.title !== 'string' || s.title.length === 0 || s.title.length > 120) blocking.push(`Slide ${n}: title must be 1 to 120 characters.`);
    const lines = Array.isArray(s.lines) ? s.lines : [];
    if (lines.length > 6) blocking.push(`Slide ${n}: more than 6 lines.`);
    if (lines.length > 3) advisory.push(`Slide ${n}: ${lines.length} lines; 3 is the advised maximum.`);
    const w = words(`${s.title ?? ''} ${lines.join(' ')}`);
    if (w > 45) advisory.push(`Slide ${n}: ${w} words; 45 is the advised maximum.`);
    all.push([`Slide ${n} title`, s.title ?? ''], ...lines.map((l, k) => [`Slide ${n} line ${k + 1}`, l]));
  });
  if (typeof c.caption !== 'string' || c.caption.length === 0) blocking.push('Caption is missing.');
  else {
    if (c.caption.length > 2200) blocking.push('Caption is over 2200 characters.');
    if (/#\w/.test(c.caption)) blocking.push('Caption must not contain hashtags.');
    if (!c.caption.trim().endsWith('?')) advisory.push('Caption should end with a question.');
    all.push(['Caption', c.caption]);
  }
  for (const [where, text] of all) {
    if (DASH.test(text)) blocking.push(`${where}: contains an em or en dash.`);
    const low = text.toLowerCase();
    for (const p of rules.bannedPhrases) if (low.includes(p)) blocking.push(`${where}: banned phrase "${p}".`);
    for (const w of rules.bannedWords) if (new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, 'i').test(text)) blocking.push(`${where}: banned word "${w}" (no fees or prices).`);
    for (const sym of rules.bannedSymbols) if (text.includes(sym)) blocking.push(`${where}: banned symbol "${sym}".`);
    for (const m of text.matchAll(PLACEHOLDER)) if (!facts.has(m[1])) blocking.push(`${where}: unknown or unverified fact "${m[1]}".`);
    const stripped = text.replace(PLACEHOLDER, '');
    if (/\b(?:19|20)\d{2}\b/.test(stripped) || /\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(stripped))
      advisory.push(`${where}: a typed year or date; use a {{fact:id}} placeholder instead.`);
  }
  if (c.leadMagnetKeyword !== undefined && (typeof c.leadMagnetKeyword !== 'string' || c.leadMagnetKeyword.length < 2 || c.leadMagnetKeyword.length > 20))
    blocking.push('leadMagnetKeyword must be 2 to 20 characters.');
  return { blocking, advisory };
}
