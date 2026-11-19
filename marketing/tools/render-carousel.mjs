#!/usr/bin/env node
// Render an approved carousel draft to 1080x1350 JPEGs.
//   node tools/render-carousel.mjs queue/approved/2026-11-20-nid-dat.md
//   node tools/render-carousel.mjs queue/drafts/x.md --preview     (any status, output goes to assets/<slug>-preview)
// Refuses to render a draft that fails the contract, uses an unknown fact, or whose text overflows its slide.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseDraft, loadFacts, lintCarousel, resolveFacts } from './lib/carousel.mjs';
import { slideDocument, mascotDataUri } from './lib/slides.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const preview = args.includes('--preview');
if (!file) { console.error('Usage: render-carousel.mjs <draft.md> [--preview]'); process.exit(2); }

const { meta, carousel } = parseDraft(readFileSync(resolve(file), 'utf8'));
if (!preview && meta.status !== 'approved') {
  console.error(`Refusing to render: status is "${meta.status ?? 'missing'}", not "approved". Use --preview for a look at a draft.`); process.exit(1);
}
const rules = JSON.parse(readFileSync(`${root}/config/copy-rules.json`, 'utf8'));
const tokens = JSON.parse(readFileSync(`${root}/context/design-tokens.json`, 'utf8'));
const facts = loadFacts(`${root}/context/facts.json`);

const { blocking, advisory } = lintCarousel(carousel, rules, facts);
if (blocking.length) { console.error('Draft fails the carousel contract:\n- ' + blocking.join('\n- ')); process.exit(1); }

const problems = [];
const slides = carousel.slides.map((s, i) => ({ ...s,
  title: resolveFacts(s.title, facts, problems, `Slide ${i + 1} title`),
  lines: (s.lines ?? []).map((l, k) => resolveFacts(l, facts, problems, `Slide ${i + 1} line ${k + 1}`)) }));
const caption = resolveFacts(carousel.caption, facts, problems, 'Caption');
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const slug = basename(file, '.md');
const outDir = `${root}/assets/${slug}${preview ? '-preview' : ''}`;
rmSync(outDir, { recursive: true, force: true }); mkdirSync(outDir, { recursive: true });

const accent = tokens.examAccent[meta.exam] ?? tokens.examAccent.default;
const ctx = { tokens, meta, accent, root, mascotUri: mascotDataUri(tokens, root), examChips: ['NIFT', 'NID', 'UCEED', 'CEED', 'NATA'] };

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: tokens.size, deviceScaleFactor: 1 });
const manifest = [];
const overflow = [];
for (let i = 0; i < slides.length; i++) {
  await page.setContent(slideDocument(slides[i], i, slides.length, ctx), { waitUntil: 'load' });
  const fits = await page.evaluate(() => { const b = document.querySelector('.body'); const s = document.querySelector('.slide'); return b.scrollHeight <= b.clientHeight + 1 && s.scrollHeight <= s.clientHeight + 1; });
  if (!fits) overflow.push(i + 1);
  const name = `slide-${String(i + 1).padStart(2, '0')}.jpg`;
  await page.screenshot({ path: `${outDir}/${name}`, type: 'jpeg', quality: 92 });
  const alt = `${slides[i].title}. ${slides[i].lines.join(' ')}`.slice(0, 1000);
  manifest.push({ file: name, role: slides[i].role, alt });
}
await browser.close();
if (overflow.length) { console.error(`Text does not fit on slide(s) ${overflow.join(', ')}. Shorten the text in the draft and render again. Images were still written to ${outDir} for inspection, do not publish them.`); process.exit(1); }

writeFileSync(`${outDir}/manifest.json`, JSON.stringify({ source: file, exam: meta.exam ?? null, size: tokens.size, caption, leadMagnetKeyword: carousel.leadMagnetKeyword ?? null, slides: manifest, advisory }, null, 2));
console.log(`Rendered ${slides.length} slides to ${outDir}`);
if (advisory.length) console.log('Advisory:\n- ' + advisory.join('\n- '));
