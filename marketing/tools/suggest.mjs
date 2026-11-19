#!/usr/bin/env node
// Free keyword discovery from Google and YouTube autocomplete (no account, no key, no cost).
//   node tools/suggest.mjs --dry-run                  show how many requests it would make
//   node tools/suggest.mjs --exam NID,NIFT            expand those exams (default: all in config/keyword-places.json)
//   node tools/suggest.mjs --depth full --max 300     also a to z after each exam
//   node tools/suggest.mjs --source youtube           reel and YouTube ideas
// Run it on your own computer: it needs open internet. One request at a time with a pause, capped, stops at the first 403/429. Results are
// cached for 30 days. Output: research/keywords/suggest-<date>.json. These are demand SIGNALS, not search volumes.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collate, expansionQueries, readJson, saveJson, suggest } from './lib/keywords.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); const opt = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
const exams = opt('exam') ? opt('exam').split(',').map((s) => s.trim()) : readJson(`${root}/config/keyword-places.json`, { exams: [] }).exams;
const sources = (opt('source') ?? 'google').split(',').map((s) => s.trim());
const depth = opt('depth') === 'full' ? 'full' : 'quick'; const max = Number(opt('max') ?? 150); const delayMs = Number(opt('delay') ?? 1200);
const queries = expansionQueries(exams, depth);
console.log(`${queries.length} queries x ${sources.length} source(s). About ${Math.ceil((queries.length * sources.length * delayMs) / 60000)} minute(s) at one request per ${delayMs} ms, capped at ${max} new requests per source.`);
if (a.includes('--dry-run')) { queries.slice(0, 12).forEach((q) => console.log(`- ${q}`)); process.exit(0); }
const cachePath = `${root}/research/keywords/cache/suggest-cache.json`;
const cache = readJson(cachePath, {}); const batches = [];
for (const source of sources) {
  const r = await suggest(queries, { source, delayMs, max, cache });
  batches.push({ source, results: r.results }); console.log(`${source}: ${r.results.length} queries answered, ${r.used} new requests.`);
  if (r.stopped) { console.error(r.stopped); break; }
}
saveJson(cachePath, cache);
const rows = collate(batches);
const out = `${root}/research/keywords/suggest-${new Date().toISOString().slice(0, 10)}.json`;
saveJson(out, { fetched: new Date().toISOString(), note: 'Autocomplete suggestions. Demand signals only, no search volumes.', depth, sources, suggestions: rows });
console.log(`Saved ${rows.length} distinct suggestions to ${out}`);
