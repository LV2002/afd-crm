/**
 * The Google Apps Script that sends a sheet's new rows to a custom webhook.
 *
 * Several tools drop leads into Google Sheets (retargeting audiences, form
 * tools, exports). A sheet row has no owner, no response clock and no place
 * in any report, so those leads wait until somebody notices them. This is the
 * piece that hands each new row to the CRM, where it goes through the same
 * path as every other lead.
 *
 * It is generated from the endpoint's own settings rather than written out in
 * a document, for the same reason `setup-guide.ts` derives its sample
 * payload: a script that has drifted from how the endpoint really works is
 * confidently wrong, and the person pasting it cannot tell.
 *
 * ## How it behaves, and why
 *
 * - **A timer, not a trigger on edit.** Rows are appended by other tools
 *   through the Sheets API, and Google's "on change" triggers are unreliable
 *   for that. Looking for unsent rows every few minutes works however the row
 *   got there, and "within five minutes" is what "automatically" has to mean.
 * - **Each row is marked.** A status column records `Sent <time>`,
 *   `Skipped: <reason>` or `Retry`. Nothing is sent twice, and the sheet itself
 *   shows what happened to every row.
 * - **A row the CRM cannot use is not retried.** No phone, say. The CRM
 *   answers 200 with a reason; resending gives the same answer. It is marked
 *   `Skipped` with the reason so somebody can fix the row.
 * - **A failure is retried, but gently.** A network or server error leaves the
 *   row for the next run. A refusal (401, 404) stops the run after marking
 *   one row, so a wrong key does not hammer the endpoint every five minutes.
 * - **Each row carries an id made from its content.** If the same row is sent
 *   twice (a retry after a timeout) the CRM sees one submission, not two.
 */

export interface SheetScriptOptions {
  /** The endpoint's full URL, `https://…/api/webhooks/custom/<token>`. */
  url: string;
  /** Sent as a signature when the endpoint requires one. */
  signingSecret: string | null;
  /** Sent as `X-AFD-Key` when the endpoint has an authentication key. */
  authKey: string | null;
}

const lit = (value: string | null): string => JSON.stringify(value ?? "");

export function googleSheetScript(options: SheetScriptOptions): string {
  return `/**
 * AFD CRM: send new rows of this sheet to the CRM.
 *
 * Paste this whole file into Extensions > Apps Script, press Save, choose the
 * function "install" and press Run. Google asks you to allow it once.
 * After that, every 5 minutes any row that has not been sent is sent, and the
 * "CRM status" column says what happened to it.
 *
 * The row needs a name and a phone number (any column called Name, Full Name,
 * Phone, Mobile, WhatsApp ... is recognised). Anything else is kept with the lead.
 *
 * Keep this project private: it contains the endpoint's key.
 */
var CRM_URL = ${lit(options.url)};
var SIGNING_SECRET = ${lit(options.signingSecret)};
var AUTH_KEY = ${lit(options.authKey)};

var SHEET_NAME = '';              // leave blank to use the first sheet
var HEADER_ROW = 1;               // the row that holds the column titles
var STATUS_TITLE = 'CRM status';  // a column this script adds and fills in
var MAX_ROWS_PER_RUN = 40;
var EVERY_MINUTES = 5;            // 1, 5, 10, 15 or 30

function install() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncNewRows') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncNewRows').timeBased().everyMinutes(EVERY_MINUTES).create();
  syncNewRows();
}

function syncNewRows() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;          // another run is still going
  try {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = SHEET_NAME ? book.getSheetByName(SHEET_NAME) : book.getSheets()[0];
    var values = sheet.getDataRange().getValues();
    if (values.length <= HEADER_ROW) return;

    var headers = values[HEADER_ROW - 1].map(function (h) { return String(h).trim(); });
    var statusCol = headers.indexOf(STATUS_TITLE);
    if (statusCol === -1) {
      statusCol = headers.length;
      sheet.getRange(HEADER_ROW, statusCol + 1).setValue(STATUS_TITLE);
      headers.push(STATUS_TITLE);
    }

    var sent = 0;
    for (var r = HEADER_ROW; r < values.length && sent < MAX_ROWS_PER_RUN; r++) {
      var row = values[r];
      var status = String(row[statusCol] || '');
      if (status.indexOf('Sent') === 0 || status.indexOf('Skipped') === 0) continue;

      var payload = {};
      var any = false;
      for (var c = 0; c < headers.length; c++) {
        if (c === statusCol || !headers[c]) continue;
        var cell = row[c];
        if (cell === '' || cell === null || cell === undefined) continue;
        if (cell instanceof Date) cell = cell.toISOString();
        else if (typeof cell === 'number') cell = String(cell);
        payload[headers[c]] = cell;
        any = true;
      }
      if (!any) continue;                       // a blank row

      // An id made from the row's own content, so a retry of the same row is
      // recognised as the same submission and never becomes a second lead.
      payload.submission_id = book.getId() + ':' + sheet.getName() + ':' + digest(JSON.stringify(payload));
      if (!hasKey(payload, 'form_name')) payload.form_name = sheet.getName();

      var result = post(payload);
      sheet.getRange(r + 1, statusCol + 1).setValue(result.status);
      sent++;
      if (result.stop) break;                   // a refusal: do not keep knocking
    }
  } finally {
    lock.releaseLock();
  }
}

function post(payload) {
  var body = JSON.stringify(payload);
  var headers = {};
  if (SIGNING_SECRET) headers['X-AFD-Signature'] = 'sha256=' + hmacHex(body, SIGNING_SECRET);
  if (AUTH_KEY) headers['X-AFD-Key'] = AUTH_KEY;

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM yyyy HH:mm');
  var res;
  try {
    res = UrlFetchApp.fetch(CRM_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: body,
      headers: headers,
      muteHttpExceptions: true
    });
  } catch (e) {
    return { status: 'Retry (no connection) ' + stamp, stop: false };
  }

  var code = res.getResponseCode();
  var json = null;
  try { json = JSON.parse(res.getContentText()); } catch (e) {}

  if (code === 200 && json && json.ok === true) {
    return { status: 'Sent ' + stamp + (json.duplicate ? ' (already in the CRM)' : ''), stop: false };
  }
  if (code === 200 && json && json.ok === false) {
    return { status: 'Skipped: ' + String(json.error || 'the CRM could not use this row').slice(0, 200), stop: false };
  }
  // 401 / 404: the key or the address is wrong. Say so on this row and stop the run.
  if (code === 401 || code === 404) {
    return { status: 'Retry (' + code + ': check the key and address in this script) ' + stamp, stop: true };
  }
  return { status: 'Retry (' + code + ') ' + stamp, stop: false };
}

function hmacHex(text, secret) {
  return Utilities.computeHmacSha256Signature(text, secret)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('');
}

function digest(text) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
  ).replace(/=+$/, '');
}

function normalise(key) { return String(key).toLowerCase().replace(/[^a-z0-9]/g, ''); }

function hasKey(obj, wanted) {
  var target = normalise(wanted);
  return Object.keys(obj).some(function (k) { return normalise(k) === target; });
}
`;
}
