#!/usr/bin/env node
// Turn an approved blog draft into the six pieces to paste into Knorish.
//   LEAD_FORM_ENDPOINT=https://script.google.com/macros/s/.../exec node tools/knorish-build.mjs queue/approved/<draft>.md
//   ... --preview        any status; writes to publish/<slug>-preview and is never for pasting
// Output (publish/<slug>/): 01..06 files in Knorish's order, PASTE-STEPS.md, and preview.html to look at the page in a browser.
// The page body is the article only: the site's own top navigation and footer stay Knorish's.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBlog, pasteSteps } from '@mb/site-build';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); const file = a.find((x) => !x.startsWith('--')); const preview = a.includes('--preview');
if (!file) { console.error('Usage: knorish-build.mjs <draft.md> [--preview]'); process.exit(2); }
const text = readFileSync(resolve(file), 'utf8');
const status = /^status:\s*(\S+)/m.exec(text)?.[1];
if (!preview && status !== 'approved') { console.error(`Refusing to build: status is "${status ?? 'missing'}", not "approved". Use --preview to look at a draft.`); process.exit(1); }

const r = buildBlog(root, text, { now: new Date(), ...(process.env.LEAD_FORM_ENDPOINT ? { endpoint: process.env.LEAD_FORM_ENDPOINT } : {}) });
if (!r.ok) { console.error('Cannot build:\n- ' + r.error.join('\n- ')); process.exit(1); }
const { pkg, slug, path, advisory } = r.value;
const out = `${root}/publish/${slug}${preview ? '-preview' : ''}`;
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const names = ['01-meta-title.txt', '02-meta-description.txt', '03-meta-keywords.txt', '04-header-code.html', '05-page-body.html', '06-footer-code.html'];
const steps = pasteSteps(pkg);
const all = [pkg.metaTitle, pkg.metaDescription, pkg.metaKeywords, pkg.headerCode, pkg.pageBody, pkg.footerCode];
all.forEach((c, i) => { if (c !== '') writeFileSync(`${out}/${names[i]}`, c); });
writeFileSync(`${out}/PASTE-STEPS.md`, `# Paste into Knorish: ${path}\n\n${preview ? '**PREVIEW ONLY. Do not paste.**\n\n' : ''}` + steps.map((s) => `${s.number}. **${s.label}**: ${s.where}\n   File: \`${names[all.indexOf(s.content)]}\`\n`).join('\n') +
  `\nThe page body is the article only. Do not paste anything over your site's top navigation or footer. The footer code is the site-wide form script: if it is already pasted site-wide, the page-level copy is harmless but not needed.\nAfter pasting, open the live page and check: the form sends a test enquiry to the Sheet, then the CRM.\n`);
writeFileSync(`${out}/preview.html`, `<!doctype html><html><head><meta charset="utf-8"><title>${pkg.metaTitle.replace(/</g, '&lt;')}</title>${pkg.headerCode}</head><body>${pkg.pageBody}${pkg.footerCode}</body></html>`);
console.log(`Built ${steps.length} pieces in ${out}`);
if (advisory.length) console.log('Advisory:\n- ' + advisory.join('\n- '));
