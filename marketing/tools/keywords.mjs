#!/usr/bin/env node
// Keyword research with real search volumes (DataForSEO, India, English).
//   node tools/keywords.mjs --dry-run                 list the keywords and the estimated cost, spend nothing
//   node tools/keywords.mjs --exam NID,NIFT           look up volumes for those exams
//   node tools/keywords.mjs --extra "nid dat cutoff,nift situation test tips"   add your own keywords
// Needs DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in the environment and monthlyCapUsd > 0 in config/budget.json.
// Results are saved to research/keywords/<date>.json and every spend is logged in research/keywords/spend.json.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidates, checkBudget, estimateUsd, fetchVolumes, monthKey, rank, readSpend, saveJson } from './lib/keywords.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const dry = process.argv.includes('--dry-run');
const read = (p) => JSON.parse(readFileSync(`${root}/${p}`, 'utf8'));

const places = read('config/keyword-places.json');
if (arg('exam')) places.exams = arg('exam').split(',').map((s) => s.trim());
let cands = candidates(read('config/keyword-seeds.json'), places);
if (arg('extra')) for (const k of arg('extra').split(',').map((s) => s.trim()).filter(Boolean)) if (!cands.some((c) => c.keyword.toLowerCase() === k.toLowerCase())) cands.push({ keyword: k, exam: undefined, place: undefined });

const estimate = estimateUsd(cands.length);
console.log(`${cands.length} keywords, estimated cost about $${estimate.toFixed(2)}.`);
if (dry) { for (const c of cands.slice(0, 20)) console.log(`- ${c.keyword}`); if (cands.length > 20) console.log(`... and ${cands.length - 20} more`); process.exit(0); }

const spendPath = `${root}/research/keywords/spend.json`;
const spend = readSpend(spendPath); const month = monthKey();
const blocked = checkBudget(read('config/budget.json').monthlyCapUsd, spend[month] ?? 0, estimate);
if (blocked) { console.error(blocked); process.exit(1); }

const r = await fetchVolumes(cands.map((c) => c.keyword), { login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD });
if (r.error) { console.error(r.error); process.exit(1); }
spend[month] = (spend[month] ?? 0) + r.costUsd; saveJson(spendPath, spend);
const ranked = rank(cands, r.volumes);
const out = `${root}/research/keywords/${new Date().toISOString().slice(0, 10)}.json`;
saveJson(out, { fetched: new Date().toISOString(), location: 'India', language: 'en', costUsd: r.costUsd, keywords: ranked });
console.log(`Saved ${ranked.length} keywords to ${out}. Spent $${r.costUsd.toFixed(3)} (month total $${spend[month].toFixed(2)}).`);
for (const k of ranked.slice(0, 15)) console.log(`${String(k.volume ?? '-').padStart(7)}  ${k.keyword}`);
