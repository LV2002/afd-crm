import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDraft, lintCarousel, loadFacts } from '../lib/carousel.mjs';
import { candidates, collate, expansionQueries, plan, suggest } from '../lib/keywords.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rules = JSON.parse(readFileSync(`${root}/config/copy-rules.json`, 'utf8'));
const facts = loadFacts(`${root}/config/facts.seed.json`);
const sample = () => parseDraft(readFileSync(`${root}/tools/test/fixtures/sample.md`, 'utf8')).carousel;

test('sample carousel passes the contract', () => {
  const r = lintCarousel(sample(), rules, facts);
  assert.deepEqual(r.blocking, []);
});
test('hook without a number, dashes, fees and unknown facts block', () => {
  const c = sample();
  c.slides[0].title = 'Things to know about NID DAT';
  c.slides[1].lines = ['Fees are Rs 5,000', 'Two stages — prelims and mains'];
  c.slides[2].lines = ['{{fact:nift-2027-exam-date}}'];
  const b = lintCarousel(c, rules, facts).blocking.join('\n');
  assert.match(b, /must contain a number/); assert.match(b, /em or en dash/); assert.match(b, /banned word "fees?"/); assert.match(b, /unknown or unverified fact/);
});
test('structure rules: summary position, one cta, slide count', () => {
  const c = sample(); c.slides.splice(6, 1);
  assert.match(lintCarousel(c, rules, facts).blocking.join('\n'), /second to last slide/);
  const d = sample(); d.slides = d.slides.slice(0, 3);
  assert.match(lintCarousel(d, rules, facts).blocking.join('\n'), /Only 3 slides/);
});
test('the renderer refuses an unapproved draft and renders an approved one', () => {
  const src = readFileSync(`${root}/tools/test/fixtures/sample.md`, 'utf8');
  const draft = `${root}/tools/test/fixtures/unapproved.md`; writeFileSync(draft, src.replace('status: approved', 'status: draft'));
  const refused = spawnSync('node', [`${root}/tools/render-carousel.mjs`, draft], { encoding: 'utf8' });
  rmSync(draft);
  assert.equal(refused.status, 1); assert.match(refused.stderr, /not "approved"/); assert.ok(!existsSync(`${root}/assets/unapproved`));
  const ok = spawnSync('node', [`${root}/tools/render-carousel.mjs`, `${root}/tools/test/fixtures/sample.md`], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const out = `${root}/assets/sample`; assert.ok(existsSync(`${out}/slide-08.jpg`)); assert.ok(existsSync(`${out}/manifest.json`));
  rmSync(out, { recursive: true, force: true });
});
test('keyword candidates cover exams x places and templates without duplicates', () => {
  const seeds = JSON.parse(readFileSync(`${root}/config/keyword-seeds.json`, 'utf8')); const places = { exams: ['NID', 'NATA'], places: ['Kochi', 'online'] };
  const c = candidates(seeds, places); const keys = c.map((x) => x.keyword.toLowerCase());
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('nid coaching in kochi')); assert.ok(keys.includes('nata coaching online')); assert.ok(keys.includes('nid studio test')); assert.ok(!keys.includes('nata studio test'));
});
import { guard, checkBlog } from '../lib/copy.mjs';
test('copy guard blocks dashes, fees, anecdotes, unknown facts; passes clean text', () => {
  const bad = guard('I remember a student. The fee is Rs 500 — {{fact:nope}}', rules, facts).blocking.join('\n');
  assert.match(bad, /dash/); assert.match(bad, /fee/); assert.match(bad, /anecdote/); assert.match(bad, /Unknown or unverified fact/);
  assert.deepEqual(guard('Plan your week. {{fact:nid-2027-dat-prelims-date}}', rules, facts).blocking, []);
});
test('blog check enforces title, meta, H1, takeaways, question H2s', () => {
  const meta = 'x'.repeat(130);
  const good = `SEO_TITLE: NID DAT eligibility explained\nMETA_DESCRIPTION: ${meta}\nSLUG: nid-dat-eligibility\n===\n# NID DAT eligibility\nIntro text.\n## Key takeaways\n- a\n## Who can take the NID DAT eligibility test?\nAnswer.\n## What should you check?\nAnswer.\n`;
  assert.deepEqual(checkBlog(good, 'nid dat eligibility').blocking, []);
  const bad = checkBlog(good.replace('# NID DAT eligibility', '# Something else'), 'nid dat eligibility').blocking.join('\n');
  assert.match(bad, /H1 must contain/);
  assert.match(checkBlog('no header', 'x').blocking.join(), /===/);
});

test('autocomplete expansion builds quick and full query sets', () => {
  const q = expansionQueries(['NID'], 'quick'); assert.ok(q.includes('nid') && q.includes('how nid') && q.includes('nid after 12th'));
  assert.equal(expansionQueries(['NID'], 'full').length, q.length + 26);
});
test('suggest is gentle: uses the cache, honours the cap, stops at the first 429, never throws on a network error', async () => {
  const ok = (arr) => async () => ({ ok: true, status: 200, json: async () => ['q', arr] });
  const cache = {};
  const r1 = await suggest(['a', 'b', 'c'], { fetchImpl: ok(['x y', 'x z']), delayMs: 0, max: 2, cache });
  assert.equal(r1.used, 2); assert.match(r1.stopped, /cap/);
  let calls = 0; const counting = async () => { calls++; return { ok: true, status: 200, json: async () => ['q', ['n']] }; };
  await suggest(['a', 'b'], { fetchImpl: counting, delayMs: 0, cache }); assert.equal(calls, 0, 'cached queries are not requested again');
  const limited = await suggest(['p', 'q'], { fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }), delayMs: 0, cache: {} });
  assert.match(limited.stopped, /429/); assert.equal(limited.used, 1);
  assert.match((await suggest(['p'], { fetchImpl: async () => { throw new Error('x'); }, delayMs: 0, cache: {} })).stopped, /reach/);
});
test('collate counts seeds and best rank; plan ranks rework and new-page candidates above one-offs', () => {
  const rows = collate([{ source: 'google', results: [{ query: 'nid', suggestions: ['nid dat syllabus', 'nid eligibility'] }, { query: 'how nid', suggestions: ['nid eligibility'] }] }]);
  const elig = rows.find((r) => r.term === 'nid eligibility'); assert.equal(elig.seedCount, 2); assert.equal(elig.bestRank, 1);
  const ranked = plan({ suggestions: rows, gscQueries: [{ query: 'nid dat cutoff', impressions: 400, clicks: 0, position: 9 }], pageOf: { 'nid dat cutoff': '/blog/post/cutoff' } });
  assert.equal(ranked[0].keyword, 'nid dat cutoff'); assert.match(ranked[0].reasons.join(), /rework/);
  assert.match(ranked.find((r) => r.keyword === 'nid eligibility').reasons.join(), /new page candidate/);
  assert.match(ranked.find((r) => r.keyword === 'nid dat syllabus').reasons.join(), /one-off/);
});

test('plan drops fee and price searches (house rule) when told to', () => {
  const rows = plan({ suggestions: [{ term: 'nid coaching fees', seedCount: 3, bestRank: 1, sources: ['google'] }, { term: 'nid syllabus', seedCount: 3, bestRank: 2, sources: ['google'] }], exclude: (k) => /fee/.test(k) });
  assert.deepEqual(rows.map((r) => r.keyword), ['nid syllabus']);
});
