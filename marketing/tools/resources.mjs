#!/usr/bin/env node
// The free-resource registry (config/resources.json). The comment-replier and dm-agent use `match`; nobody guesses.
//   node tools/resources.mjs validate
//   node tools/resources.mjs list
//   node tools/resources.mjs set --id ID [--status copy-ready|made|in-drive (with --drive-registered once the owner added the file to the Sheet's Resources tab)] [--keyword WORD] [--file path] [--title ".."] [--promise ".."] [--description ".."] [--button ".."] [--dm-text ".. {link}"] [--exam NID] [--piece slug] [--drive-registered]
//   node tools/resources.mjs add --id ID --keyword WORD --title ".." --promise ".." --button ".." [--exam NID]       (status planned)
//   node tools/resources.mjs mark-live --id ID --url https://afdindia.com/... --tested yyyy-mm-dd [--drive-registered]   (ONLY after the owner confirmed the link works)
//   node tools/resources.mjs dm-on --id ID | dm-off --id ID                                                     (owner's switch for automatic DMs)
//   node tools/resources.mjs add-placement --id ID --platform instagram --post <media id> [--shortcode <from the post URL>] --piece slug   (after a post is published)
//   node tools/resources.mjs match --platform instagram --post <media id> --text "..." [--person <commenter id>]
//   node tools/resources.mjs log --id ID --platform instagram --post <id> --person <commenter id> --action sent|skipped|opted-out
//   node tools/resources.mjs sync-offers                                                                        (live resources become blog offer cards)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFacts } from './lib/carousel.mjs';
import { alreadySent, isOptOut, matchComment, optedOut, resourceByKeyword, syncOffers, validateRegistry } from './lib/resources.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); const cmd = a[0];
const opt = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
const read = (p) => JSON.parse(readFileSync(`${root}/${p}`, 'utf8'));
const regPath = `${root}/config/resources.json`; const logPath = `${root}/data/dm-log.json`;
const reg = read('config/resources.json'); const site = read('config/site.json');
const ctx = { rules: read('config/copy-rules.json'), facts: loadFacts(`${root}/config/facts.seed.json`), siteUrl: site.siteUrl };
const save = () => { const p = validateRegistry(reg, ctx); if (p.length) { console.error('Not saved. Problems:\n- ' + p.join('\n- ')); process.exit(1); } writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n'); };
const need = (n) => { const v = opt(n); if (v === undefined) { console.error(`--${n} is required`); process.exit(2); } return v; };
const find = () => { const r = reg.resources.find((x) => x.id === need('id')); if (!r) { console.error(`No resource "${opt('id')}".`); process.exit(1); } return r; };
const readLog = () => (existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : []);

switch (cmd) {
  case 'validate': { const p = validateRegistry(reg, ctx); if (p.length) { console.error('Problems:\n- ' + p.join('\n- ')); process.exit(1); } console.log(`Registry valid: ${reg.resources.length} resources, ${reg.placements.length} placements.`); break; }
  case 'list': for (const r of reg.resources) console.log(`${r.keyword.padEnd(12)} ${r.status.padEnd(20)} dm:${r.dmEnabled ? 'on ' : 'off'} ${r.id}  (${reg.placements.filter((p) => p.resourceId === r.id).length} posts)`); break;
  case 'add': {
    const r = { id: need('id'), title: need('title'), promise: need('promise'), description: opt('description') ?? '', exam: opt('exam') ?? '', keyword: need('keyword').toUpperCase(), button: need('button'), format: 'pdf', status: 'planned', landingUrl: '', file: '', linkTested: false, linkTestedOn: '', driveRegistered: false, dmEnabled: false, dmText: '', pieces: opt('piece') ? [opt('piece')] : [] };
    reg.resources.push(r); save(); console.log(`Added ${r.id} (${r.keyword}), status planned.`); break; }
  case 'set': {
    const r = find();
    for (const [flag, key] of [['status', 'status'], ['keyword', 'keyword'], ['file', 'file'], ['title', 'title'], ['promise', 'promise'], ['description', 'description'], ['button', 'button'], ['dm-text', 'dmText'], ['exam', 'exam']]) if (opt(flag) !== undefined) r[key] = flag === 'keyword' ? opt(flag).toUpperCase() : opt(flag);
    if (opt('status') === 'live') { console.error('Use mark-live (needs the URL and the tested date).'); process.exit(1); }
    if (a.includes('--drive-registered')) r.driveRegistered = true;
    if (opt('piece') && !r.pieces.includes(opt('piece'))) r.pieces.push(opt('piece'));
    save(); console.log(`Updated ${r.id}.`); break; }
  case 'mark-live': {
    const r = find(); r.landingUrl = need('url'); r.linkTested = true; r.linkTestedOn = need('tested'); if (a.includes('--drive-registered')) r.driveRegistered = true; r.status = 'live'; save(); console.log(`${r.id} is live. Automatic DMs stay off until: node tools/resources.mjs dm-on --id ${r.id}`); break; }
  case 'dm-on': { const r = find(); r.dmEnabled = true; save(); console.log(`DMs on for ${r.id}.`); break; }
  case 'dm-off': { const r = find(); r.dmEnabled = false; save(); console.log(`DMs off for ${r.id}.`); break; }
  case 'add-placement': {
    const r = find(); reg.placements.push({ resourceId: r.id, keyword: r.keyword, platform: need('platform'), postId: need('post'), ...(opt('shortcode') ? { shortcode: opt('shortcode') } : {}), piece: opt('piece') ?? '', registeredOn: new Date().toISOString().slice(0, 10) });
    if (opt('piece') && !r.pieces.includes(opt('piece'))) r.pieces.push(opt('piece')); save(); console.log(`Registered ${r.keyword} on ${opt('platform')} post ${opt('post')}.`); break; }
  case 'match': {
    const text = need('text'); const person = opt('person'); const log = readLog();
    let res = matchComment(reg, { platform: need('platform'), postId: need('post'), text });
    if (res.action === 'send-dm' && person) {
      if (optedOut(log, person)) res = { action: 'none', reason: 'This person opted out earlier. Never message them.' };
      else if (alreadySent(log, res.resourceId, person)) res = { action: 'none', reason: 'This person already received this resource.' };
    }
    if (isOptOut(text)) res = { action: 'opt-out', reason: 'The message is an opt-out. Log it and never message this person again.' };
    console.log(JSON.stringify(res, null, 2)); break; }
  case 'log': {
    const log = readLog(); log.push({ resourceId: need('id'), platform: need('platform'), postId: need('post'), person: need('person'), action: need('action'), at: new Date().toISOString() });
    mkdirSync(dirname(logPath), { recursive: true }); writeFileSync(logPath, JSON.stringify(log, null, 2)); console.log('Logged.'); break; }
  case 'sync-offers': {
    const offersPath = `${root}/config/offers.json`; const { offers, added } = syncOffers(reg, read('config/offers.json'), site.siteUrl);
    writeFileSync(offersPath, JSON.stringify(offers, null, 2) + '\n'); console.log(added.length ? `Added or refreshed offers: ${added.join(', ')}` : 'No live resources to add.'); break; }
  default: console.error('Commands: validate, list, add, set, mark-live, dm-on, dm-off, add-placement, match, log, sync-offers'); process.exit(2);
}
