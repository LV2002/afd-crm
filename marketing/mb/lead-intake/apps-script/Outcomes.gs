/**
 * What happened to each enquiry in the CRM: contacted, demo, admitted, lost. The CRM reports it here, signed, and the app reads it
 * to show which pages and sources bring admissions, not only enquiries.
 *
 *   CRM  --signed POST-->  this script  -->  sheet tab "Lead outcomes"  -->  Marketing Brain (read-only)
 *
 * Script property needed: OUTCOMES_SECRET, a long random phrase. Give the same phrase to the CRM (it signs every call with it). The CRM
 * sends the form field _afd_publish = outcome, timestamp (milliseconds), payloadJson and signature = HMAC-SHA256 hex of
 * timestamp + "." + payloadJson. The request must be less than ten minutes old. Enquiries are matched by submission_id.
 */

const OUTCOMES_SHEET = 'Lead outcomes';
const OUTCOMES_HEADER = ['Received', 'Submission ID', 'Status', 'Event at', 'Revenue INR', 'Note', 'Key'];
const OUTCOMES_MAX_AGE_MS = 10 * 60 * 1000;
const OUTCOMES_MAX_EVENTS = 200;

function outcomesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(OUTCOMES_SHEET);
  if (!s) {
    s = ss.insertSheet(OUTCOMES_SHEET);
    s.getRange(1, 1, 1, OUTCOMES_HEADER.length).setValues([OUTCOMES_HEADER]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

// Called from doPost for a request marked _afd_publish = outcome. The log only grows: a status change is a new row, never an edit.
function recordOutcomes_(d) {
  const secret = PropertiesService.getScriptProperties().getProperty('OUTCOMES_SECRET');
  if (!secret) return { ok: false, error: 'OUTCOMES_SECRET is not set in Script properties' };
  const ts = Number(d.timestamp), payloadJson = String(d.payloadJson || '');
  if (!isFinite(ts) || Math.abs(Date.now() - ts) > OUTCOMES_MAX_AGE_MS) return { ok: false, error: 'the request is too old, or has no time' };
  if (!sameText_(hmacHex_(secret, ts + '.' + payloadJson), String(d.signature || ''))) return { ok: false, error: 'the signature does not match' };
  let payload;
  try { payload = JSON.parse(payloadJson); } catch (x) { return { ok: false, error: 'the outcomes could not be read' }; }
  if (!payload || payload.version !== 1 || !Array.isArray(payload.events) || payload.events.length === 0 || payload.events.length > OUTCOMES_MAX_EVENTS) {
    return { ok: false, error: 'the outcomes are in a shape this script does not know' };
  }
  const rows = [];
  for (let i = 0; i < payload.events.length; i++) {
    const e = payload.events[i] || {};
    const at = new Date(e.event_at);
    const revenue = e.revenue_inr === undefined || e.revenue_inr === null || e.revenue_inr === '' ? '' : Number(e.revenue_inr);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(e.submission_id)) || !/^[a-z][a-z_]{1,29}$/.test(String(e.status)) || isNaN(at.getTime()) ||
        (revenue !== '' && (!isFinite(revenue) || revenue < 0 || revenue > 10000000))) {
      return { ok: false, error: 'an outcome is not valid (number ' + (i + 1) + ')' };
    }
    rows.push([String(e.submission_id), String(e.status), at.toISOString(), revenue, cell_(clean_(e.note, 200))]);
  }
  const sheet = outcomesSheet_(), last = sheet.getLastRow();
  const seen = {};
  if (last > 1) sheet.getRange(Math.max(2, last - 4999), 7, Math.min(last - 1, 5000), 1).getValues().forEach(function (r) { seen[String(r[0])] = true; });
  let added = 0;
  const now = new Date();
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j], key = r[0] + '|' + r[1] + '|' + r[2];
    if (seen[key]) continue;                                    // the CRM resent it: already stored
    seen[key] = true;
    sheet.appendRow([now, r[0], r[1], r[2], r[3], r[4], key]);
    added++;
  }
  return { ok: true, added: added, duplicates: rows.length - added };
}
