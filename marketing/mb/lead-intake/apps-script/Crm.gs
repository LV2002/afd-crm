/**
 * CRM delivery. Works with ANY Apps Script that logs enquiries, including your existing one:
 * paste this file into the project and call  sendToCrm(data)  right after the line that writes the row.
 *
 * Script properties (Project Settings > Script properties):
 *   CRM_URL     the webhook address the CRM shows you (https://YOUR-CRM-DOMAIN/api/webhooks/website)
 *   CRM_SECRET  the signing key from the CRM ("Generate the signing key")
 * The key lives only here. It is never on the website, in the page code or in the dashboard.
 *
 * If the CRM is unreachable the enquiry is put in a "CRM queue" tab and retried every 15 minutes; it is never lost and never blocks the sheet.
 */

const QUEUE_NAME = 'CRM queue';
const QUEUE_MAX_TRIES = 12;

// Returns { status: 'sent' | 'rejected' | 'queued', note }.
function sendToCrm(data) {
  const out = postToCrm_(data);
  if (out.status === 'retry') {
    queueCrm_(data, out.note);
    return { status: 'queued', note: out.note };
  }
  return out;
}

function postToCrm_(data) {
  try {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('CRM_URL'), secret = props.getProperty('CRM_SECRET');
    if (!url || !secret) return { status: 'retry', note: 'CRM_URL and CRM_SECRET are not set in Script properties' };
    const body = JSON.stringify(data);
    // Sign the exact bytes being sent. The CRM recomputes this and rejects anything that does not match.
    const raw = Utilities.computeHmacSha256Signature(body, secret);
    const hex = raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
    const r = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', payload: body,
      headers: { 'X-AFD-Signature': 'sha256=' + hex }, muteHttpExceptions: true,
    });
    const code = r.getResponseCode(), note = code + ': ' + String(r.getContentText()).slice(0, 300);
    console.log('CRM responded ' + note);
    if (code >= 200 && code < 300) return { status: 'sent', note: note };
    if (code >= 400 && code < 500 && code !== 408 && code !== 429) return { status: 'rejected', note: note };   // the CRM said no: retrying will not help
    return { status: 'retry', note: note };
  } catch (err) {
    return { status: 'retry', note: 'error: ' + String(err).slice(0, 300) };
  }
}

function queueSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(QUEUE_NAME);
  if (!s) {
    s = ss.insertSheet(QUEUE_NAME);
    s.getRange(1, 1, 1, 5).setValues([['Queued', 'Status', 'Tries', 'Last response', 'Payload (JSON)']]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function queueCrm_(data, note) {
  queueSheet_().appendRow([new Date(), 'waiting', 1, note, JSON.stringify(data)]);
}

// Every 15 minutes: try again for anything the CRM has not accepted.
function retryCrmQueue() {
  const s = queueSheet_(), last = s.getLastRow();
  if (last < 2) return;
  const rows = s.getRange(2, 1, last - 1, 5).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][1] !== 'waiting') continue;
    let data;
    try { data = JSON.parse(rows[i][4]); } catch (e) { s.getRange(i + 2, 2).setValue('bad payload'); continue; }
    const r = postToCrm_(data), tries = Number(rows[i][2] || 0) + 1;
    let status = r.status === 'sent' ? 'sent' : r.status === 'rejected' ? 'rejected' : (tries >= QUEUE_MAX_TRIES ? 'gave up' : 'waiting');
    s.getRange(i + 2, 2, 1, 3).setValues([[status, tries, r.note]]);
  }
}

function installCrmRetryTimer() {
  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'retryCrmQueue'; });
  if (!has) ScriptApp.newTrigger('retryCrmQueue').timeBased().everyMinutes(15).create();
  return !has;
}

// Run from the editor: sends one clearly labelled test enquiry (it appears in the CRM as "TEST - ignore"; delete it there).
function sendTestEnquiry() {
  console.log(JSON.stringify(sendToCrm({ submission_id: 'test-' + Date.now(), name: 'TEST - ignore', phone: '9000000000', email: 'test@example.com', course: 'NIFT', exam: 'NIFT', city: 'Kochi', page: '/test', form: 'Test form', page_url: 'https://afdindia.com/test' })));
}
