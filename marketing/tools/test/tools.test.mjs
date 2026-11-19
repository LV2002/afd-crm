import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDraft, lintCarousel, loadFacts } from '../lib/carousel.mjs';
import { candidates, checkBudget, fetchVolumes, rank } from '../lib/keywords.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rules = JSON.parse(readFileSync(`${root}/config/copy-rules.json`, 'utf8'));
const facts = loadFacts(`${root}/context/facts.json`);
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
test('budget cap of zero blocks paid calls; a cap lets them through until exceeded', () => {
  assert.match(checkBudget(0, 0, 0.1), /cap/); assert.equal(checkBudget(5, 1, 0.1), null); assert.match(checkBudget(5, 4.95, 0.1), /past the cap/);
});
test('fetchVolumes parses a DataForSEO reply and reports auth and server errors', async () => {
  const ok = { ok: true, status: 200, json: async () => ({ cost: 0.08, tasks: [{ status_code: 20000, result: [{ keyword: 'NID Eligibility', search_volume: 2400, competition_index: 12 }] }] }) };
  const r = await fetchVolumes(['nid eligibility'], { login: 'a', password: 'b', fetchImpl: async () => ok });
  assert.equal(r.volumes['nid eligibility'].volume, 2400); assert.equal(r.costUsd, 0.08);
  assert.match((await fetchVolumes(['x'], { login: '', password: '' })).error, /not set/);
  assert.match((await fetchVolumes(['x'], { login: 'a', password: 'b', fetchImpl: async () => ({ ok: false, status: 401 }) })).error, /refused/);
  assert.match((await fetchVolumes(['x'], { login: 'a', password: 'b', fetchImpl: async () => { throw new Error('x'); } })).error, /reach/);
});
test('rank sorts by volume and puts unknown last', () => {
  const r = rank([{ keyword: 'a' }, { keyword: 'b' }, { keyword: 'c' }], { b: { volume: 50, competition: 1 }, a: { volume: 10, competition: 1 } });
  assert.deepEqual(r.map((x) => x.keyword), ['b', 'a', 'c']);
});

import { guard, checkBlog } from '../lib/copy.mjs';
test('copy guard blocks dashes, fees, anecdotes, unknown facts; passes clean text', () => {
  const bad = guard('I remember a student. The fee is Rs 500 — {{fact:nope}}', rules, facts).blocking.join('\n');
  assert.match(bad, /dash/); assert.match(bad, /fee/); assert.match(bad, /anecdote/); assert.match(bad, /Unknown or unverified fact/);
  assert.deepEqual(guard('Plan your week. {{fact:nid-2027-prelims-date}}', rules, facts).blocking, []);
});
test('blog check enforces title, meta, H1, takeaways, question H2s', () => {
  const meta = 'x'.repeat(130);
  const good = `SEO_TITLE: NID DAT eligibility explained\nMETA_DESCRIPTION: ${meta}\nSLUG: nid-dat-eligibility\n===\n# NID DAT eligibility\nIntro text.\n## Key takeaways\n- a\n## Who can take the NID DAT eligibility test?\nAnswer.\n## What should you check?\nAnswer.\n`;
  assert.deepEqual(checkBlog(good, 'nid dat eligibility').blocking, []);
  const bad = checkBlog(good.replace('# NID DAT eligibility', '# Something else'), 'nid dat eligibility').blocking.join('\n');
  assert.match(bad, /H1 must contain/);
  assert.match(checkBlog('no header', 'x').blocking.join(), /===/);
});
