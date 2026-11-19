#!/usr/bin/env node
// Make a free resource PDF (A4) from resources/<id>/resource.md in the AFD design language.
//   node tools/render-resource.mjs resources/nid-weekly-plan/resource.md
// The resource must exist in config/resources.json. Copy rules run first; {{fact:id}} placeholders resolve from config/facts.seed.json and an
// unknown or unverified fact stops the build. Output: resources/<id>/<id>.pdf. It does NOT make anything live: only the owner can,
// after uploading the file and testing the link (tools/resources.mjs mark-live).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './lib/browser.mjs';
import { marked } from 'marked';
import { loadFacts, resolveFacts } from './lib/carousel.mjs';
import { guard } from './lib/copy.mjs';
import { fontFaces } from './lib/slides.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
if (!file) { console.error('Usage: render-resource.mjs resources/<id>/resource.md'); process.exit(2); }
const text = readFileSync(resolve(file), 'utf8');
const fm = /^---\n([\s\S]*?)\n---\n/.exec(text); const meta = {};
if (fm) for (const l of fm[1].split('\n')) { const m = /^([A-Za-z_]+):\s*(.*)$/.exec(l); if (m) meta[m[1]] = m[2].trim(); }
const md = fm ? text.slice(fm[0].length) : text;
const id = meta.id ?? basename(dirname(resolve(file)));
const reg = JSON.parse(readFileSync(process.env.RESOURCES_FILE ?? `${root}/config/resources.json`, 'utf8'));
const res = reg.resources.find((r) => r.id === id);
if (!res) { console.error(`"${id}" is not in config/resources.json. Add it first: node tools/resources.mjs add ...`); process.exit(1); }

const rules = JSON.parse(readFileSync(`${root}/config/copy-rules.json`, 'utf8'));
const facts = loadFacts(`${root}/config/facts.seed.json`);
const g = guard(md, rules, facts);
if (g.blocking.length) { console.error('Copy rules failed:\n- ' + g.blocking.join('\n- ')); process.exit(1); }
if (/<script|<iframe|\son[a-z]+\s*=|javascript:/i.test(md)) { console.error('The resource contains script, iframe or event handler markup, which is not allowed.'); process.exit(1); }
const problems = []; const resolved = resolveFacts(md, facts, problems, 'Resource');
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const t = JSON.parse(readFileSync(`${root}/context/design-tokens.json`, 'utf8')); const c = t.colors; const accent = t.examAccent[res.exam] ?? t.examAccent.default;
const phones = t.contact.phones.map((p) => `${p.centre} ${p.number}`).join('  |  ');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaces(t, root)}
@page{size:A4;margin:0}*{box-sizing:border-box}
body{margin:0;font-family:${t.font.body};color:${c.ink};font-size:12.5pt;line-height:1.55}
.cover{height:297mm;padding:26mm 22mm;background:${c.paper};display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}
.chip{display:inline-block;background:${accent};color:#fff;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:6px 16px;border-radius:999px;font-size:11pt}
.cover h1{font-family:${t.font.display};font-size:44pt;line-height:1.05;margin:18px 0 14px}
.cover p{font-size:15pt;max-width:150mm}
.cover .foot{font-weight:700;font-size:11pt}
.page{padding:20mm 22mm}
h1,h2,h3{font-family:${t.font.display};line-height:1.15}
h2{font-size:20pt;margin:22px 0 8px;border-left:6px solid ${accent};padding-left:12px;break-after:avoid}
h3{font-size:14pt;margin:16px 0 6px;break-after:avoid}
table{border-collapse:collapse;width:100%;margin:10px 0;break-inside:avoid}th,td{border:1px solid ${c.khaki};padding:7px 10px;text-align:left;vertical-align:top}th{background:${c.khaki}}
li{margin:4px 0}blockquote{margin:12px 0;padding:10px 14px;background:${c.paper};border-left:5px solid ${c.highlight}}
.note{margin-top:22px;padding:10px 14px;background:${c.paper};font-size:10.5pt}
.end{margin-top:26px;padding:16px;background:${c.dark};color:${c.onDark};border-radius:10px;break-inside:avoid}
.end b{color:${c.highlight}}
</style></head><body>
<section class="cover"><div><span class="chip">${res.exam || 'Design entrance'}</span><h1>${res.title.replace(/</g, '&lt;')}</h1><p>${res.promise.replace(/</g, '&lt;')}</p></div><div class="foot">AFD India &middot; ${t.contact.site}<br>Free resource for students preparing for design and architecture entrance exams</div></section>
<section class="page">${marked.parse(resolved, { async: false, gfm: true })}
<div class="note">Dates and rules can change. Always check the exam body's official notice before you apply.</div>
<div class="end"><b>Talk to a mentor</b><br>Tell us which exam you are aiming for and we will point you to the right first step.<br>Call or WhatsApp: ${phones}<br>${t.contact.site}</div></section></body></html>`;

const browser = await launchBrowser(); const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
mkdirSync(`${root}/resources/${id}`, { recursive: true });
const out = `${root}/resources/${id}/${id}.pdf`;
await page.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: `<div style="width:100%;font-size:8px;text-align:center;color:#666">AFD India &middot; ${t.contact.site} &middot; page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`, margin: { top: '0', bottom: '10mm' } });
await browser.close();
writeFileSync(`${root}/resources/${id}/BUILD-NOTES.md`, `Built ${new Date().toISOString()} from resource.md. Fonts fall back to Inter until brand fonts are added. Review the PDF before anything goes live.\n`);
console.log(`Wrote ${out}`);
if (g.advisory.length) console.log('Advisory:\n- ' + g.advisory.join('\n- '));
