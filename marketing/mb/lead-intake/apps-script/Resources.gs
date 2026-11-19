/**
 * Free resources (past papers and the like) handed out after a form is sent, behind a link that cannot be passed around.
 *
 *   form with resource_id  ->  lead stored first (Code.gs)  ->  a one-time-style link is made  ->  the browser opens it in a new tab
 *
 * The files stay private in Drive. The link opens a page that this script builds with the file inside it, so the Drive address is never shown.
 * Each link works for DOWNLOAD_HOURS and opens at most MAX_OPENS times; after that the visitor must send the form again, which gives you the lead again.
 *
 * Setup: add this file to the Apps Script project, put the files in Drive (any folder, no sharing needed), then add one row per resource to the
 * "Resources" tab: Resource ID (the short name used in Marketing Brain), Title, and the Drive file link or id. Then Deploy > New version.
 */

const RESOURCES_SHEET = 'Resources';
const DOWNLOADS_SHEET = 'Downloads';
const DOWNLOAD_HOURS = 24;
const MAX_OPENS = 3;
const DL_COLUMNS = ['Token', 'Resource ID', 'Submission ID', 'Issued', 'Expires', 'Opens', 'Last opened'];

function tab_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function fileIdOf_(text) {
  const m = String(text || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

// Returns the address of a fresh private link for the resource, or '' when the resource is not set up (the lead is stored either way).
function issueDownload_(resourceId, submissionId) {
  const rid = clean_(resourceId, 60);
  if (!rid) return '';
  const res = tab_(RESOURCES_SHEET, ['Resource ID', 'Title', 'Drive file link or id']);
  const rows = res.getLastRow() > 1 ? res.getRange(2, 1, res.getLastRow() - 1, 3).getValues() : [];
  let found = false;
  rows.forEach(function (r) { if (String(r[0]).trim() === rid && fileIdOf_(r[2])) found = true; });
  if (!found) return '';
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const now = new Date(), until = new Date(now.getTime() + DOWNLOAD_HOURS * 3600000);
  const dl = tab_(DOWNLOADS_SHEET, DL_COLUMNS);
  dl.getRange(dl.getLastRow() + 1, 1, 1, DL_COLUMNS.length).setValues([[token, rid, submissionId, now, until, 0, '']]);
  return ScriptApp.getService().getUrl() + '?dl=' + token;
}

function page_(title, bodyHtml) {
  return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font:16px system-ui,sans-serif">' + bodyHtml + '</body>').setTitle(title);
}

function serveDownload_(token) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const dl = tab_(DOWNLOADS_SHEET, DL_COLUMNS);
    const n = dl.getLastRow() - 1;
    const rows = n > 0 ? dl.getRange(2, 1, n, DL_COLUMNS.length).getValues() : [];
    let at = -1;
    rows.forEach(function (r, i) { if (String(r[0]) === token) at = i; });
    const gone = function (why) { return page_('Link expired', '<div style="max-width:30em;margin:15vh auto;padding:0 20px"><h1>' + why + '</h1><p>Please send the form again on afdindia.com and your link will open straight away.</p></div>'); };
    if (at < 0) return gone('This link is not valid');
    const row = rows[at], sheetRow = at + 2;
    if (new Date(row[4]).getTime() < Date.now()) return gone('This link has expired');
    if (Number(row[5]) >= MAX_OPENS) return gone('This link has been used');
    const res = tab_(RESOURCES_SHEET, ['Resource ID', 'Title', 'Drive file link or id']);
    const list = res.getLastRow() > 1 ? res.getRange(2, 1, res.getLastRow() - 1, 3).getValues() : [];
    let fileId = '', title = '';
    list.forEach(function (r) { if (String(r[0]).trim() === String(row[1])) { fileId = fileIdOf_(r[2]); title = String(r[1]); } });
    if (!fileId) return gone('This resource is not available');
    dl.getRange(sheetRow, 6).setValue(Number(row[5]) + 1);
    dl.getRange(sheetRow, 7).setValue(new Date());
    const blob = DriveApp.getFileById(fileId).getBlob();
    const mime = blob.getContentType(), data = Utilities.base64Encode(blob.getBytes());
    // The file is decoded in the visitor's browser and shown from memory, so there is no address to copy.
    const viewer = '<div id="v" style="height:100vh"></div><script>(function(){var b=atob(' + JSON.stringify(data) + '),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);' +
      'var u=URL.createObjectURL(new Blob([a],{type:' + JSON.stringify(mime) + '})),m=document.getElementById("v");' +
      'if(/^image\\//.test(' + JSON.stringify(mime) + ')){m.innerHTML=\'<img style="max-width:100%" src="\'+u+\'">\';}else{m.innerHTML=\'<iframe style="border:0;width:100%;height:100%" src="\'+u+\'"></iframe>\';}})();</script>';
    return page_(title || 'Your resource', viewer);
  } finally {
    lock.releaseLock();
  }
}
