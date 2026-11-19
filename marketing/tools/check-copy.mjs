#!/usr/bin/env node
// Copy checks for a reel script or a blog article.
//   node tools/check-copy.mjs queue/drafts/x-reel.md
//   node tools/check-copy.mjs queue/drafts/x-blog.md --blog --keyword "nid dat eligibility" [--secondary "a,b"]
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFacts } from './lib/carousel.mjs';
import { checkBlog, guard } from './lib/copy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); const file = a.find((x) => !x.startsWith('--'));
const opt = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
if (!file) { console.error('Usage: check-copy.mjs <file> [--blog --keyword "..."]'); process.exit(2); }
const text = readFileSync(resolve(file), 'utf8');
const rules = JSON.parse(readFileSync(`${root}/config/copy-rules.json`, 'utf8'));
const facts = loadFacts(`${root}/config/facts.seed.json`);
const g = guard(text, rules, facts);
let blocking = g.blocking; let advisory = g.advisory;
if (a.includes('--blog')) {
  if (!opt('keyword')) { console.error('--blog needs --keyword'); process.exit(2); }
  const b = checkBlog(text, opt('keyword'), (opt('secondary') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  blocking = [...blocking, ...b.blocking]; advisory = [...advisory, ...b.advisory];
}
if (advisory.length) console.log('Advisory:\n- ' + advisory.join('\n- '));
if (blocking.length) { console.error('BLOCKING:\n- ' + blocking.join('\n- ')); process.exit(1); }
console.log('Copy checks passed.');
