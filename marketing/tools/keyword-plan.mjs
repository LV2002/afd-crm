#!/usr/bin/env node
// Rank keyword opportunities by combining autocomplete suggestions with your own Search Console data. Free, no volumes.
//   node tools/keyword-plan.mjs        reads the newest research/keywords/suggest-*.json and performance/google/*.json
// Output: research/keywords/plan-<date>.json and .md. Run tools/suggest.mjs and tools/google-sync.mjs first for best results.
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { intentOf, isMoneyTopic } from '@mb/topics';
import { plan, readJson, saveJson } from './lib/keywords.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const newest = (dir, re) => { try { return readdirSync(dir).filter((f) => re.test(f)).sort().at(-1); } catch { return undefined; } };
const sf = newest(`${root}/research/keywords`, /^suggest-.*\.json$/); const gf = newest(`${root}/performance/google`, /^\d{4}-\d{2}-\d{2}\.json$/);
const suggestions = sf ? readJson(`${root}/research/keywords/${sf}`, { suggestions: [] }).suggestions : [];
const g = gf ? readJson(`${root}/performance/google/${gf}`, { queries: [], reworkCandidates: [] }) : { queries: [], reworkCandidates: [] };
const pageOf = Object.fromEntries((g.reworkCandidates ?? []).map((r) => [r.query.toLowerCase(), r.page]));
const rows = plan({ suggestions, gscQueries: g.queries ?? [], pageOf, intentOf: (k) => intentOf(k)?.id, exclude: isMoneyTopic });
const date = new Date().toISOString().slice(0, 10);
const sources = [sf ? `autocomplete ${sf}` : 'NO autocomplete data (run tools/suggest.mjs)', gf ? `Search Console ${gf}` : 'NO Search Console data (run tools/google-sync.mjs)'];
saveJson(`${root}/research/keywords/plan-${date}.json`, { date, sources, note: 'Demand signals, not search volumes. score has no unit and only orders the list.', keywords: rows });
const top = rows.slice(0, 40);
writeFileSync(`${root}/research/keywords/plan-${date}.md`, `# Keyword plan, ${date}\n\nFee, price and cost searches are left out on purpose (house rule: no fee content).\n\nSources: ${sources.join('; ')}.\n\n**These are demand signals, not monthly search volumes.** "Impressions" are what Search Console says your own site was shown for; "suggested by" counts how many of our seed searches Google or YouTube autocomplete offered the phrase for.\n\n| Keyword | Intent | Impressions | Clicks | Position | Suggested by | Why |\n|---|---|---|---|---|---|---|\n` + top.map((r) => `| ${r.keyword} | ${r.intent ?? ''} | ${r.impressions} | ${r.clicks} | ${r.position === null ? '' : r.position.toFixed(1)} | ${r.suggestSeeds} | ${r.reasons.join('; ')} |`).join('\n') + '\n');
console.log(`${rows.length} keywords ranked. Top 10:`); top.slice(0, 10).forEach((r) => console.log(`${String(r.score).padStart(6)}  ${r.keyword}  (${r.reasons[0]})`));
