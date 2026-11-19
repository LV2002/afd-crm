/**
 * Pop-ups for the website, managed in Marketing Brain.
 *
 *   Marketing Brain  --signed-->  this script  -->  tab "Popups" (one row per pop-up that is ON)  -->  GET <address>?facts=1  (the same feed as the facts)
 *   the footer script reads the feed on every page and shows the pop-up that matches the page. Off means it is not in the feed, so it never shows.
 *
 * Pictures: the app sends the picture with the pop-up. It is saved once to your Drive (shared as "anyone with the link can view", which a
 * website picture needs) and listed in the tab "Popup images". Uses the same FACTS_SECRET as the facts feed.
 */

const POPUPS_SHEET = 'Popups';
const POPUP_IMAGES_SHEET = 'Popup images';
const FIELD_KEYS = ['email', 'exam', 'city', 'studying', 'message'];

function popupTab_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

// One saved copy of each picture, found again by its fingerprint, so publishing twice never fills Drive.
function popupImageUrl_(item) {
  if (!item.imageB64 || !/^[a-f0-9]{16}$/.test(String(item.imageHash || ''))) return '';
  const tab = popupTab_(POPUP_IMAGES_SHEET, ['Hash', 'Link', 'Drive file id']);
  const n = tab.getLastRow() - 1;
  const rows = n > 0 ? tab.getRange(2, 1, n, 3).getValues() : [];
  for (let i = 0; i < rows.length; i++) if (String(rows[i][0]) === item.imageHash) return String(rows[i][1]);
  const type = item.imageType === 'image/png' ? 'image/png' : 'image/jpeg';
  const file = DriveApp.createFile(Utilities.newBlob(Utilities.base64Decode(item.imageB64), type, 'popup-' + item.imageHash));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w900';
  tab.getRange(tab.getLastRow() + 1, 1, 1, 3).setValues([[item.imageHash, url, file.getId()]]);
  return url;
}

function popupItem_(p) {
  if (!p || !/^[a-z][a-z0-9-]{1,30}$/.test(String(p.id))) return null;
  const fields = (Array.isArray(p.fields) ? p.fields : []).filter(function (f) { return f && FIELD_KEYS.indexOf(f.key) >= 0; }).map(function (f) {
    const out = { key: f.key, label: clean_(f.label, 60), required: f.required === true };
    if (Array.isArray(f.options)) out.options = f.options.slice(0, 20).map(function (o) { return clean_(o, 60); });
    return out;
  });
  const pages = p.pages && ['all', 'only', 'except'].indexOf(p.pages.mode) >= 0 ? p.pages : { mode: 'all', paths: [] };
  return {
    id: String(p.id), v: clean_(p.v, 40), title: clean_(p.title, 80), body: clean_(p.body, 280), button: clean_(p.button, 40), thanks: clean_(p.thanks, 200),
    fields: fields, delaySeconds: Math.max(0, Math.min(120, Number(p.delaySeconds) || 0)), repeatDays: Math.max(0, Math.min(60, Number(p.repeatDays) || 0)),
    pages: { mode: pages.mode, paths: (Array.isArray(pages.paths) ? pages.paths : []).filter(function (x) { return /^\/[A-Za-z0-9\/_\-.]*$/.test(String(x)); }).slice(0, 40) },
    imageUrl: popupImageUrl_(p),
  };
}

// Called from doPost for _afd_publish = popups. Signed like the facts feed.
function publishPopups_(d) {
  const checked = verifiedPayload_(d);
  if (checked.error) return { ok: false, error: checked.error };
  const payload = checked.payload;
  if (payload.version !== 1 || !Array.isArray(payload.popups)) return { ok: false, error: 'the pop-ups are in a shape this script does not know' };
  const rows = [];
  for (let i = 0; i < payload.popups.length; i++) {
    const item = popupItem_(payload.popups[i]);
    if (!item) return { ok: false, error: 'a pop-up is not valid' };
    rows.push([item.id, JSON.stringify(item), clean_(payload.publishedAt, 40)]);
  }
  const sheet = popupTab_(POPUPS_SHEET, ['Popup id', 'Feed JSON (what the website reads)', 'Published']), last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, 3).clearContent();
  if (rows.length > 0) {
    const range = sheet.getRange(2, 1, rows.length, 3);
    range.setNumberFormat('@');
    range.setValues(rows);
  }
  CacheService.getScriptCache().remove(FACTS_CACHE_KEY);
  return { ok: true, count: rows.length };
}

function livePopups_() {
  const sheet = popupTab_(POPUPS_SHEET, ['Popup id', 'Feed JSON (what the website reads)', 'Published']), last = sheet.getLastRow();
  if (last < 2) return [];
  const out = [];
  sheet.getRange(2, 1, last - 1, 3).getValues().forEach(function (r) { try { out.push(JSON.parse(String(r[1]))); } catch (x) { /* a row that is not valid is skipped */ } });
  return out;
}
