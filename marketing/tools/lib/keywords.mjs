// Free keyword research. No paid data and no search volumes: it combines (1) what Google and YouTube autocomplete offer for our seeds,
// (2) what Search Console says people already see and click on our own site, and (3) the intent of each search.
// Every number is a demand SIGNAL, not a monthly volume, and the output says so.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Seeds: every exam with every kind of search, and every exam in every place (config/keyword-seeds.json, config/keyword-places.json).
export function candidates(seeds, places) {
  const out = []; const seen = new Set();
  const add = (keyword, exam, place) => { const k = keyword.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ keyword, exam, place }); } };
  for (const exam of places.exams) {
    for (const s of seeds.seeds) { if (s.exams && !s.exams.includes(exam)) continue; add(s.template.replaceAll('{exam}', exam), exam, undefined); }
    for (const place of places.places) add(`${exam} coaching ${place === 'online' ? 'online' : `in ${place}`}`, exam, place);
  }
  return out;
}

const QUESTIONS = ['how', 'what', 'when', 'can', 'is', 'which', 'why', 'who'];
const QUICK_TAILS = ['for commerce students', 'for arts students', 'after 12th', 'after 10th', 'at home', 'cutoff', 'vs', 'books', 'mock test', 'online', 'in kerala'];

// The search phrases to put to autocomplete. quick: the exam, question openers and common tails. full: adds a to z after each exam.
export function expansionQueries(exams, depth) {
  const out = [];
  for (const e of exams) {
    const base = e.toLowerCase();
    out.push(base, ...QUESTIONS.map((q) => `${q} ${base}`), ...QUICK_TAILS.map((t) => `${base} ${t}`));
    if (depth === 'full') for (const c of 'abcdefghijklmnopqrstuvwxyz') out.push(`${base} ${c}`);
  }
  return [...new Set(out)];
}

const ENDPOINTS = {
  google: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=in&q=${encodeURIComponent(q)}`,
  youtube: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=en&gl=in&q=${encodeURIComponent(q)}`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gentle by design: one request at a time, a pause between them, a hard cap, and it stops at the first refusal (403 or 429).
export async function suggest(queries, { source = 'google', fetchImpl = fetch, delayMs = 1200, max = 150, cache = {}, now = Date.now() }) {
  const results = []; let used = 0; let stopped = null;
  for (const q of queries) {
    const key = `${source}:${q}`;
    const hit = cache[key];
    if (hit && now - hit.at < 30 * 86_400_000) { results.push({ query: q, suggestions: hit.suggestions, cached: true }); continue; }
    if (used >= max) { stopped = `Reached the request cap (${max}). Run again later to continue; finished queries are cached.`; break; }
    let res;
    try { res = await fetchImpl(ENDPOINTS[source](q), { headers: { 'User-Agent': 'AFD-India-keyword-research (owner use, low volume)' } }); } catch { stopped = 'Could not reach the suggestion service.'; break; }
    used++;
    if (res.status === 403 || res.status === 429) { stopped = `The service answered ${res.status}. Stopped; try again later or tomorrow.`; break; }
    if (!res.ok) { results.push({ query: q, suggestions: [], error: res.status }); await sleep(delayMs); continue; }
    let data; try { data = await res.json(); } catch { data = null; }
    const suggestions = Array.isArray(data) && Array.isArray(data[1]) ? data[1].filter((s) => typeof s === 'string') : [];
    cache[key] = { at: now, suggestions };
    results.push({ query: q, suggestions });
    await sleep(delayMs);
  }
  return { results, used, stopped, cache };
}

// One row per distinct suggestion: how many of our queries produced it and its best position in the list (earlier means more people typed it).
export function collate(batches) {
  const m = new Map();
  for (const { source, results } of batches) for (const r of results) r.suggestions.forEach((s, i) => {
    const k = s.toLowerCase().trim(); if (!k) return;
    const e = m.get(k) ?? { term: k, sources: new Set(), queries: new Set(), bestRank: 99 };
    e.sources.add(source); e.queries.add(r.query); e.bestRank = Math.min(e.bestRank, i + 1); m.set(k, e);
  });
  return [...m.values()].map((e) => ({ term: e.term, sources: [...e.sources], seedCount: e.queries.size, bestRank: e.bestRank }));
}

// Merge the signals into one ranked list. score is only for ordering, it has no unit.
export function plan({ suggestions, gscQueries = [], pageOf = {}, intentOf, exclude = () => false }) {
  const rows = new Map();
  const row = (term) => { const k = term.toLowerCase().trim(); if (!rows.has(k)) rows.set(k, { keyword: k, impressions: 0, clicks: 0, position: null, page: null, suggestSeeds: 0, bestRank: null, sources: [] }); return rows.get(k); };
  for (const s of suggestions) { const r = row(s.term); r.suggestSeeds = s.seedCount; r.bestRank = s.bestRank; r.sources = s.sources; }
  for (const q of gscQueries) { const r = row(q.query); r.impressions = q.impressions; r.clicks = q.clicks; r.position = q.position; r.page = pageOf[q.query.toLowerCase()] ?? null; }
  return [...rows.values()].filter((r) => !exclude(r.keyword)).map((r) => {
    const reasons = [];
    let score = Math.log10(1 + r.impressions) * 20 + Math.min(r.suggestSeeds, 5) * 4 + (r.bestRank !== null ? Math.max(0, 6 - r.bestRank) * 2 : 0);
    if (r.position !== null && r.position >= 5 && r.position <= 15 && r.impressions >= 30) { reasons.push('ranks 5 to 15: rework the page that ranks'); score += 15; }
    if (r.impressions >= 50 && r.clicks === 0) reasons.push('seen but never clicked: improve the title and answer');
    if (r.impressions > 0 && r.page === null && r.position === null) reasons.push('impressions with no known page');
    if (r.impressions === 0 && r.suggestSeeds >= 2) reasons.push('people type this (several seeds suggest it) and we get no impressions yet: new page candidate');
    if (reasons.length === 0) reasons.push(r.impressions > 0 ? 'already getting impressions' : 'one-off suggestion, low evidence');
    return { ...r, intent: intentOf ? intentOf(r.keyword) ?? null : null, score: Math.round(score * 10) / 10, reasons };
  }).sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword));
}

export function readJson(path, fallback) { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback; }
export function saveJson(path, data) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2)); }
