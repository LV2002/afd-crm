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

import { alreadySent, isOptOut, matchComment, optedOut, syncOffers, validateRegistry } from '../lib/resources.mjs';
import { OffersConfigSchema } from '@mb/lead-intake';
const siteUrl = 'https://afdindia.com';
const live = (over = {}) => ({ id: 'nid-plan', title: 'NID weekly practice plan', promise: 'A week by week drawing plan you can start today.', description: '', exam: 'NID', keyword: 'NIDPLAN', button: 'Send me the plan', format: 'pdf', status: 'live', landingUrl: 'https://afdindia.com/blog/post/nid-plan', linkTested: true, linkTestedOn: '2026-11-20', driveRegistered: true, dmEnabled: true, dmText: 'Hi! Here is your NID weekly plan: {link}', pieces: [], ...over });
const regOf = (resources, placements = []) => ({ resources, placements });
const placed = (r, postId = '111') => ({ resourceId: r.id, keyword: r.keyword, platform: 'instagram', postId, piece: 'x' });

test('registry validation: unique keywords, common words, fees, untested links, wrong host', () => {
  const ctx = { rules, facts, siteUrl };
  assert.deepEqual(validateRegistry(regOf([live()]), ctx), []);
  assert.match(validateRegistry(regOf([live(), live({ id: 'other' })]), ctx).join(), /already used/);
  assert.match(validateRegistry(regOf([live({ keyword: 'FREE' })]), ctx).join(), /common word/);
  assert.match(validateRegistry(regOf([live({ dmText: 'The fee is Rs 500 {link}' })]), ctx).join(), /dmText/);
  assert.match(validateRegistry(regOf([live({ linkTested: false })]), ctx).join(), /not been tested/);
  assert.match(validateRegistry(regOf([live({ landingUrl: 'https://example.com/x' })]), ctx).join(), /landingUrl/);
  assert.match(validateRegistry(regOf([live({ status: 'made', dmEnabled: true })]), ctx).join(), /not live/);
  const r = live(); assert.match(validateRegistry(regOf([r], [{ ...placed(r), keyword: 'WRONG' }]), ctx).join(), /does not match/);
});

test('match: the right resource for the right comment on the right post, and nothing when unsure', () => {
  const a = live(); const b = live({ id: 'nata-pack', keyword: 'NATAPACK', landingUrl: 'https://afdindia.com/blog/post/nata-pack', dmText: 'NATA pack: {link}' });
  const reg = regOf([a, b], [placed(a, '111'), placed(b, '222'), placed(b, '111')]);
  const m = (postId, text) => matchComment(reg, { platform: 'instagram', postId, text });
  assert.equal(m('111', 'nidplan please!').action, 'send-dm');
  assert.equal(m('111', '#NIDPLAN').message, 'Hi! Here is your NID weekly plan: https://afdindia.com/blog/post/nid-plan');
  assert.equal(m('222', 'NIDPLAN').action, 'none', 'a keyword that belongs to another post is not a match here');
  assert.equal(m('222', 'natapack').resourceId, 'nata-pack');
  assert.equal(m('111', 'love this, thanks').action, 'none');
  assert.equal(m('999', 'NIDPLAN').action, 'none');
  const bySc = regOf([a], [{ ...placed(a, '111'), shortcode: 'Cabc123' }]);
  assert.equal(matchComment(bySc, { platform: 'instagram', postId: 'Cabc123', text: 'NIDPLAN' }).action, 'send-dm', 'a post can be matched by its URL shortcode too');
  assert.equal(m('111', 'NIDPLANNING').action, 'none', 'whole word only');
  assert.equal(m('111', 'NIDPLAN and NATAPACK').action, 'draft-only', 'two resources in one comment goes to the owner');
});

test('match refuses to send when the resource is not live, not tested, or DMs are off', () => {
  const m = (r) => matchComment(regOf([r], [placed(r)]), { platform: 'instagram', postId: '111', text: 'NIDPLAN' });
  assert.equal(m(live({ status: 'made' })).action, 'draft-only');
  assert.equal(m(live({ linkTested: false })).action, 'draft-only');
  assert.equal(m(live({ dmEnabled: false })).action, 'draft-only');
  assert.equal(m(live()).action, 'send-dm');
});

test('send log: one DM per person per resource, opt-outs are permanent, opt-out words are recognised', () => {
  const log = [{ resourceId: 'nid-plan', person: 'p1', action: 'sent' }, { resourceId: 'nid-plan', person: 'p2', action: 'opted-out' }];
  assert.ok(alreadySent(log, 'nid-plan', 'p1')); assert.ok(!alreadySent(log, 'nid-plan', 'p3')); assert.ok(!alreadySent(log, 'other', 'p1'));
  assert.ok(optedOut(log, 'p2')); assert.ok(!optedOut(log, 'p1'));
  assert.ok(isOptOut('STOP')); assert.ok(isOptOut(' unsubscribe. ')); assert.ok(!isOptOut('please do not stop sending'));
});

test('a live resource becomes a valid blog offer card; others are left out', () => {
  const offers = JSON.parse(readFileSync(`${root}/config/offers.json`, 'utf8'));
  const { offers: next, added } = syncOffers(regOf([live(), live({ id: 'in-drive-one', keyword: 'DRIVEONE', status: 'in-drive', landingUrl: '' }), live({ id: 'made-one', keyword: 'MADEONE', status: 'made' })]), offers, siteUrl);
  assert.deepEqual(added, ['nid-plan', 'in-drive-one']);
  const parsed = OffersConfigSchema.safeParse({ ...next, offers: next.offers.map(({ generatedFromResource, ...o }) => o) });
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  assert.equal(next.offers.find((o) => o.id === 'nid-plan').deliverUrl, '/blog/post/nid-plan');
  assert.equal(next.offers.find((o) => o.id === 'in-drive-one').resourceId, 'in-drive-one');
});

test('carousel gate: a comment-a-word post needs a live, tested resource and the right caption', () => {
  const r = live(); const reg = regOf([r]);
  const c = () => { const x = sample(); x.leadMagnetKeyword = 'NIDPLAN'; x.slides.at(-1).lines = ['Comment NIDPLAN for the free weekly plan.']; x.caption = 'Steady practice wins. Comment NIDPLAN for the free NID weekly plan. Which day will you start?'; return x; };
  assert.deepEqual(lintCarousel(c(), rules, facts, reg).blocking, []);
  assert.match(lintCarousel(c(), rules, facts, regOf([live({ linkTested: false })])).blocking.join(), /untested link/);
  assert.match(lintCarousel(c(), rules, facts, regOf([live({ keyword: 'OTHERWORD' })])).blocking.join(), /not a registered resource/);
  const noAsk = c(); noAsk.caption = 'Steady practice wins. Which day will you start?';
  assert.match(lintCarousel(noAsk, rules, facts, reg).blocking.join(), /must ask people to "Comment NIDPLAN"/);
  const stray = sample(); stray.caption = 'Comment SECRETWORD for the guide. Ready?';
  assert.match(lintCarousel(stray, rules, facts, reg).blocking.join(), /no leadMagnetKeyword/);
});

test('resource renderer makes a PDF from a registered resource, resolves facts, and refuses an unregistered one or a fee', () => {
  const dir = `${root}/resources/zz-test-resource`; const tmp = `${root}/tools/test/fixtures/_reg.json`; const bad = `${root}/tools/test/fixtures/_bad.md`;
  const reg = { resources: [live({ id: 'zz-test-resource', keyword: 'ZZTESTKEY', title: 'Test resource', promise: 'A test promise that is long enough.', exam: 'NID' })], placements: [] };
  writeFileSync(tmp, JSON.stringify(reg));
  const run = (file, env = {}) => spawnSync('node', [`${root}/tools/render-resource.mjs`, file], { encoding: 'utf8', env: { ...process.env, RESOURCES_FILE: tmp, ...env } });
  try {
    const ok = run(`${root}/tools/test/fixtures/resource.md`);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(readFileSync(`${dir}/zz-test-resource.pdf`).subarray(0, 5).toString(), '%PDF-');
    writeFileSync(bad, readFileSync(`${root}/tools/test/fixtures/resource.md`, 'utf8').replace('Draw every day', 'The fee is Rs 500. Draw every day'));
    assert.equal(run(bad).status, 1);
    writeFileSync(tmp, JSON.stringify({ resources: [], placements: [] }));
    const unreg = run(`${root}/tools/test/fixtures/resource.md`); assert.equal(unreg.status, 1); assert.match(unreg.stderr, /not in config\/resources\.json/);
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(tmp, { force: true }); rmSync(bad, { force: true }); }
});
