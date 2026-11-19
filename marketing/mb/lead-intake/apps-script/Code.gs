/**
 * afdindia enquiry intake (use this if you want a fresh start; if you already have a logger, keep it and just add Crm.gs, see docs).
 *
 *   website form  ->  this web app  ->  Google Sheet "Enquiries" (the backup, written FIRST)  ->  CRM (Crm.gs, signed, queued if down)
 *
 * First time: run setup() once, then Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone, and copy the /exec address.
 * Every later change to the code needs Deploy > Manage deployments > Edit > New version.
 */

const SHEET_NAME = 'Enquiries';
const COLUMNS = ['Received', 'Submission ID', 'Name', 'Phone', 'Email', 'Exam', 'City', 'Page', 'Form', 'Page URL',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'Intent', 'Action', 'CRM status', 'CRM response', 'All fields (JSON)'];
const COL = {};
COLUMNS.forEach(function (c, i) { COL[c] = i + 1; });
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const d = readFields_(e);
    if (d._afd_publish === 'facts') return reply_(publishFacts_(d));   // the app updating the website's facts: signed, not a lead
    if (d._afd_publish === 'popups') return reply_(publishPopups_(d));   // the app updating the website's pop-ups: signed, not a lead
    if (d._afd_publish === 'outcome') return reply_(recordOutcomes_(d)); // the CRM reporting what became of enquiries: signed, not a lead
    if (d.company_website) return reply_({ ok: true });                 // honeypot: a bot filled the hidden field; pretend success, store nothing

    const name = clean_(d.name, 80);
    const phone = String(d.phone || '').replace(/\D/g, '');                              // a phone number is exactly ten digits, nothing else
    const digits = phone;
    if (!name || digits.length !== 10) return reply_({ ok: false, error: 'name and a 10 digit phone number are needed' });

    const cache = CacheService.getScriptCache();
    const sid = clean_(d.submission_id, 80) || Utilities.getUuid();
    if (cache.get('sid_' + sid)) return reply_({ ok: true, duplicate: true });          // the browser retried: already stored
    const hourKey = 'ph_' + digits.slice(-10), seen = Number(cache.get(hourKey) || 0);
    if (seen >= 5) return reply_({ ok: true, throttled: true });                         // the same number five times in an hour is noise

    const f = { submission_id: sid, name: name, phone: phone, email: clean_(d.email, 120), exam: clean_(d.exam, 40), city: clean_(d.city, 60),
      page: clean_(d.page, 200), form: clean_(d.form, 120), page_url: clean_(d.page_url, 500), intent: clean_(d.intent, 40), action: clean_(d.action || d.placement, 60) };
    UTM.forEach(function (k) { f[k] = clean_(d[k], 200); });
    const extra = {};                                                                    // never lose a field the form sent that we did not expect
    Object.keys(d).forEach(function (k) { if (!(k in f) && k !== 'company_website' && k !== 'placement') extra[k] = clean_(d[k], 500); });

    const sheet = sheet_(), row = sheet.getLastRow() + 1, v = COLUMNS.map(function () { return ''; });
    const put = function (c, x) { v[COL[c] - 1] = cell_(x); };
    put('Received', new Date()); put('Submission ID', sid); put('Name', f.name); put('Email', f.email); put('Exam', f.exam); put('City', f.city);
    put('Page', f.page); put('Form', f.form); put('Page URL', f.page_url); put('Intent', f.intent); put('Action', f.action);
    UTM.forEach(function (k) { put(k, f[k]); });
    v[COL['Phone'] - 1] = f.phone;
    put('CRM status', 'pending');
    v[COL['All fields (JSON)'] - 1] = JSON.stringify(Object.assign({}, f, extra));
    sheet.getRange(row, COL['Phone']).setNumberFormat('@');                              // keep +91 and leading digits exactly as typed
    sheet.getRange(row, 1, 1, COLUMNS.length).setValues([v]);                            // 1. the backup is written first
    cache.put('sid_' + sid, '1', 21600);                                                 // remembered only once stored, so a retry after a failed write is not mistaken for a duplicate
    cache.put(hourKey, String(seen + 1), 3600);

    const payload = Object.assign({}, extra, f, { course: f.exam });                     // 2. then the CRM; failures are queued, never thrown
    Object.keys(payload).forEach(function (k) { if (payload[k] === '' || payload[k] == null) delete payload[k]; });
    const r = sendToCrm(payload);
    sheet.getRange(row, COL['CRM status']).setValue(r.status);
    sheet.getRange(row, COL['CRM response']).setValue(r.note);
    const download = issueDownload_(extra.resource_id, sid);                              // 3. a private link to the free resource, if the form asked for one
    return reply_(download ? { ok: true, download: download } : { ok: true });
  } catch (err) {
    console.error('doPost failed: ' + err);
    return reply_({ ok: false, error: 'server error' });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.dl) return serveDownload_(String(e.parameter.dl));     // the private link to a free resource
  if (e && e.parameter && e.parameter.facts) return reply_(liveFacts_());     // the facts feed the footer script reads
  return reply_({ ok: true, service: 'afdindia enquiry intake' });
}

// Run once from the editor.
function setup() {
  sheet_();
  const made = installCrmRetryTimer();
  const p = PropertiesService.getScriptProperties();
  console.log('Sheet ready. Retry timer ' + (made ? 'created' : 'already set') + '. CRM_URL ' + (p.getProperty('CRM_URL') ? 'set' : 'MISSING') + ', CRM_SECRET ' + (p.getProperty('CRM_SECRET') ? 'set' : 'MISSING') + '.');
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEET_NAME);
  if (!s) {
    s = ss.insertSheet(SHEET_NAME);
    s.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function readFields_(e) {
  if (e && e.postData && /json/i.test(e.postData.type || '')) { try { return JSON.parse(e.postData.contents); } catch (x) { return {}; } }
  return Object.assign({}, (e && e.parameter) || {});
}

function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }
// A cell that starts with = + - @ would be run as a formula by Sheets. Make it plain text.
function cell_(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; }
function reply_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
