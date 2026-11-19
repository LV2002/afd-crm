#!/usr/bin/env node
// Pull Search Console and Google Analytics 4 numbers into data/analytics.db, then write a report for the agents.
//   node tools/google-sync.mjs                 sync (first run backfills 90 days), then write performance/google/<date>.json and .md
//   node tools/google-sync.mjs --report-only   skip the sync, just rebuild the report
//   node tools/google-sync.mjs --page /blog/post/x --published 2026-11-20    before and after for one page
// Key: GOOGLE_SERVICE_ACCOUNT_KEY_PATH (default secrets/google-service-account.json, outside git). Sites: config/google.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleConfigSchema, buildReport, openGoogleData, pageWindow, reportMarkdown } from '@mb/google-data';
import { istDate } from '@mb/platform';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); const opt = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
const keyPath = resolve(root, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ?? 'secrets/google-service-account.json');
const config = GoogleConfigSchema.safeParse(JSON.parse(readFileSync(`${root}/config/google.json`, 'utf8')));
if (!config.success) { console.error('config/google.json needs gscSite and ga4PropertyId.'); process.exit(1); }
if (!a.includes('--report-only') && !existsSync(keyPath)) {
  console.error(`No Google key at ${keyPath}. Save the service account JSON there (or set GOOGLE_SERVICE_ACCOUNT_KEY_PATH), share it with Search Console (${config.data.gscSite}) and Analytics (property ${config.data.ga4PropertyId}). See performance/README.md.`); process.exit(1);
}
mkdirSync(`${root}/data`, { recursive: true });
const g = openGoogleData({ keyPath, config: config.data, dbPath: `${root}/data/analytics.db` });
if (!a.includes('--report-only')) {
  const s = await g.sync((pct, note) => console.log(`${String(pct).padStart(3)}%  ${note}`));
  console.log(`Read ${s.rows} rows.`);
  for (const e of s.errors) console.error(`${e.source}: ${e.message}`);
}
const today = istDate(g.clock.now());
if (opt('page')) {
  if (!opt('published')) { console.error('--page needs --published yyyy-mm-dd'); process.exit(2); }
  console.log(JSON.stringify(pageWindow(g.store, opt('page'), opt('published'), today), null, 2)); process.exit(0);
}
const r = buildReport(g.store, today);
mkdirSync(`${root}/performance/google`, { recursive: true });
writeFileSync(`${root}/performance/google/${today}.json`, JSON.stringify(r, null, 2));
writeFileSync(`${root}/performance/google/${today}.md`, reportMarkdown(r));
console.log(`Report written to performance/google/${today}.md and .json`);
