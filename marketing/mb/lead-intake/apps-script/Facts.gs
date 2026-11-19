/**
 * Live facts: the website's single source for exam dates and other facts.
 *
 *   Marketing Brain (your Mac)  --signed-->  this script  -->  sheet tab "Live facts"  -->  GET <address>?facts=1
 *   every page's footer script reads the feed and refreshes each <span data-afd-fact="id"> on the page.
 *
 * Script property needed (Project Settings > Script properties): FACTS_SECRET, a long random phrase. The same phrase goes in the
 * app's .env as FACTS_PUBLISH_SECRET. Nothing is published unless the request is signed with it and is less than ten minutes old.
 */

const FACTS_SHEET = 'Live facts';
const FACTS_HEADER = ['Fact id', 'Label', 'Value', 'Date', 'Published'];
const FACTS_MAX_AGE_MS = 10 * 60 * 1000;
const FACTS_CACHE_KEY = 'facts_feed';

function hmacHex_(secret, text) {
  return Utilities.computeHmacSha256Signature(text, secret).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// Same answer in the same time whether the first characters match or not.
function sameText_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function factsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(FACTS_SHEET);
  if (!s) {
    s = ss.insertSheet(FACTS_SHEET);
    s.getRange(1, 1, 1, FACTS_HEADER.length).setValues([FACTS_HEADER]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

// The signed requests from the app (facts, pop-ups): returns { payload } when the signature and the time are right, else { error }.
function verifiedPayload_(d) {
  const secret = PropertiesService.getScriptProperties().getProperty('FACTS_SECRET');
  if (!secret) return { error: 'FACTS_SECRET is not set in Script properties' };
  const ts = Number(d.timestamp), payloadJson = String(d.payloadJson || '');
  if (!isFinite(ts) || Math.abs(Date.now() - ts) > FACTS_MAX_AGE_MS) return { error: 'the request is too old, or has no time' };
  if (!sameText_(hmacHex_(secret, ts + '.' + payloadJson), String(d.signature || ''))) return { error: 'the signature does not match' };
  try { return { payload: JSON.parse(payloadJson) }; } catch (x) { return { error: 'the request could not be read' }; }
}

// Called from doPost for a request marked _afd_publish = facts. Returns a plain object for reply_.
function publishFacts_(d) {
  const checked = verifiedPayload_(d);
  if (checked.error) return { ok: false, error: checked.error };
  const payload = checked.payload;
  if (!payload || payload.version !== 1 || typeof payload.facts !== 'object' || payload.facts === null) return { ok: false, error: 'the facts are in a shape this script does not know' };
  const rows = [];
  const ids = Object.keys(payload.facts);
  for (let i = 0; i < ids.length; i++) {
    const f = payload.facts[ids[i]];
    if (!/^[a-z0-9][a-z0-9-]*$/.test(ids[i]) || !f || typeof f.value !== 'string') return { ok: false, error: 'a fact is not valid: ' + ids[i] };
    rows.push([ids[i], cell_(clean_(f.label, 200)), cell_(clean_(f.value, 300)), clean_(f.date, 10), clean_(payload.publishedAt, 40)]);
  }
  const sheet = factsSheet_(), last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, FACTS_HEADER.length).clearContent();
  if (rows.length > 0) {
    const range = sheet.getRange(2, 1, rows.length, FACTS_HEADER.length);
    range.setNumberFormat('@');                                    // keep dates and values exactly as written
    range.setValues(rows);
  }
  CacheService.getScriptCache().remove(FACTS_CACHE_KEY);
  return { ok: true, count: rows.length };
}

// GET <address>?facts=1
function liveFacts_() {
  const cache = CacheService.getScriptCache(), hit = cache.get(FACTS_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const sheet = factsSheet_(), last = sheet.getLastRow();
  const facts = {};
  let publishedAt = '';
  if (last > 1) {
    sheet.getRange(2, 1, last - 1, FACTS_HEADER.length).getValues().forEach(function (r) {
      facts[String(r[0])] = { label: String(r[1]), value: String(r[2]), date: String(r[3]) };
      publishedAt = String(r[4]);
    });
  }
  const feed = { ok: true, version: 1, publishedAt: publishedAt, facts: facts, popups: livePopups_() };
  cache.put(FACTS_CACHE_KEY, JSON.stringify(feed), 300);
  return feed;
}
