// Keyword candidates, DataForSEO volume lookup (India, English) and a monthly spend cap. Ported from Marketing Brain's seo-research package.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const LOCATION_INDIA = 2356;
// DataForSEO bills per task plus a small amount per keyword. Used only to estimate before asking; the real cost from the reply is recorded.
export const estimateUsd = (n) => 0.075 + 0.0001 * n;

// Every exam with every kind of search, and every exam in every place.
export function candidates(seeds, places) {
  const out = []; const seen = new Set();
  const add = (keyword, exam, place) => { const k = keyword.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ keyword, exam, place }); } };
  for (const exam of places.exams) {
    for (const s of seeds.seeds) { if (s.exams && !s.exams.includes(exam)) continue; add(s.template.replaceAll('{exam}', exam), exam, undefined); }
    for (const place of places.places) add(`${exam} coaching ${place === 'online' ? 'online' : `in ${place}`}`, exam, place);
  }
  return out;
}

export function monthKey(d = new Date()) { return d.toISOString().slice(0, 7); }

export function readSpend(path) { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}; }

export function checkBudget(capUsd, spent, estimate) {
  if (!(capUsd > 0)) return 'The monthly cap in config/budget.json is 0, so no paid keyword calls are allowed. Set monthlyCapUsd to allow them.';
  if (spent + estimate > capUsd) return `This lookup (about $${estimate.toFixed(2)}) would take this month's spend ($${spent.toFixed(2)}) past the cap of $${capUsd.toFixed(2)}.`;
  return null;
}

export async function fetchVolumes(keywords, { login, password, fetchImpl = fetch }) {
  if (!login || !password) return { error: 'DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are not set in the environment.' };
  let res;
  try {
    res = await fetchImpl('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ keywords, location_code: LOCATION_INDIA, language_code: 'en' }]) });
  } catch { return { error: 'Could not reach DataForSEO.' }; }
  if (res.status === 401 || res.status === 403) return { error: 'DataForSEO refused the login.' };
  if (!res.ok) return { error: `DataForSEO answered with status ${res.status}.` };
  const j = await res.json(); const task = j.tasks?.[0];
  if (!task || (task.status_code ?? 20000) >= 40000) return { error: `DataForSEO said: ${task?.status_message ?? 'no result'}.` };
  const volumes = {};
  for (const r of task.result ?? []) if (r.keyword) volumes[r.keyword.toLowerCase()] = { volume: r.search_volume ?? 0, competition: r.competition_index ?? null };
  return { volumes, costUsd: typeof j.cost === 'number' ? j.cost : estimateUsd(keywords.length) };
}

// Rank: highest volume first; keywords with no volume data last.
export function rank(cands, volumes) {
  return cands.map((c) => ({ ...c, volume: volumes[c.keyword.toLowerCase()]?.volume ?? null, competition: volumes[c.keyword.toLowerCase()]?.competition ?? null }))
    .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.localeCompare(b.keyword));
}

export function saveJson(path, data) { mkdirSync(path.replace(/\/[^/]*$/, ''), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2)); }
