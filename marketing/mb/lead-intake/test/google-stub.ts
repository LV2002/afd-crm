import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Runs the real Apps Script files in Node with stand-ins for the Google services.
type Row = unknown[];

class FakeSheet {
  rows: Row[] = [];
  formats = new Map<string, string>();
  failDataWrites = false;
  getLastRow = (): number => this.rows.length;
  setFrozenRows = (): void => {};
  appendRow = (row: Row): void => {
    this.rows.push(row);
  };
  getRange = (r: number, c: number, nr = 1, nc = 1) => {
    const put = (rowIndex: number, colIndex: number, value: unknown): void => {
      const row = (this.rows[rowIndex] ??= []);
      row[colIndex] = value;
    };
    const style = { setFontWeight: (): void => {} };
    return {
      setValues: (v: Row[]) => {
        if (this.failDataWrites && r > 1) throw new Error('Service invoked too many times');
        v.forEach((row, i) => { row.forEach((x, j) => { put(r - 1 + i, c - 1 + j, x); }); });
        return style;
      },
      setValue: (x: unknown) => { put(r - 1, c - 1, x); },
      getValues: () => this.rows.slice(r - 1, r - 1 + nr).map((x) => x.slice(c - 1, c - 1 + nc)),
      setNumberFormat: (f: string) => { this.formats.set(`${r}:${c}`, f); },
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) put(r - 1 + i, c - 1 + j, ''); },
    };
  };
}

export interface GoogleStub {
  readonly props: Record<string, string | null>;
  readonly sheets: Map<string, FakeSheet>;
  readonly fetches: { url: string; options: { payload: string; headers: Record<string, string> } }[];
  crm: { status: number | 'throw' };
  post(fields: Record<string, string>): Record<string, unknown>;
  postJson(body: unknown): Record<string, unknown>;
  get(params: Record<string, string>): Record<string, unknown>;
  // The page served for a private resource link (the HTML, as the visitor's browser would receive it).
  open(params: Record<string, string>): { title: string; html: string };
  // Files in Drive, by id.
  readonly drive: Map<string, { type: string; bytes: Buffer }>;
  call(fn: string): void;
}

export function makeGoogleStub(dir: string): GoogleStub {
  const code = ['Crm.gs', 'Facts.gs', 'Outcomes.gs', 'Resources.gs', 'Popups.gs', 'Code.gs'].map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
  const props: Record<string, string | null> = { CRM_URL: 'https://crm.example/api/webhooks/website', CRM_SECRET: 'k3y' };
  const sheets = new Map<string, FakeSheet>();
  const fetches: GoogleStub['fetches'] = [];
  const crm: GoogleStub['crm'] = { status: 200 };
  const cache = new Map<string, string>();
  const drive = new Map<string, { type: string; bytes: Buffer }>();
  const ctx = createContext({
    console: { log: (): void => {}, error: (): void => {} },
    LockService: { getScriptLock: () => ({ waitLock: (): void => {}, releaseLock: (): void => {} }) },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => { cache.set(k, v); }, remove: (k: string) => { cache.delete(k); } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n: string) => sheets.get(n) ?? null,
        insertSheet: (n: string) => { const s = new FakeSheet(); sheets.set(n, s); return s; },
      }),
    },
    HtmlService: { createHtmlOutput: (html: string) => ({ html, title: '', setTitle(t: string) { this.title = t; return this; } }) },
    DriveApp: { Access: { ANYONE_WITH_LINK: 'link' }, Permission: { VIEW: 'view' }, createFile: (blob: { bytes: Buffer; type: string }) => { const id = `drive${String(drive.size + 1).padStart(28, '0')}`; drive.set(id, { type: blob.type, bytes: blob.bytes }); return { getId: () => id, setSharing: (): void => {} }; }, getFileById: (id: string) => { const f = drive.get(id); if (f === undefined) throw new Error('no file'); return { getBlob: () => ({ getContentType: () => f.type, getBytes: () => Array.from(f.bytes) }) }; } },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/ABC/exec' }), getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: (): void => {} }) }) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ text: s, setMimeType() { return this; } }) },
    Utilities: {
      getUuid: () => randomUUID(),
      base64Decode: (s: string) => Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes: number[], type: string) => ({ bytes: Buffer.from(bytes), type }),
      base64Encode: (bytes: number[]) => Buffer.from(bytes).toString('base64'),
      computeHmacSha256Signature: (body: string, secret: string) => Array.from(createHmac('sha256', secret).update(body).digest()).map((b) => (b > 127 ? b - 256 : b)),
    },
    UrlFetchApp: {
      fetch: (url: string, options: { payload: string; headers: Record<string, string> }) => {
        fetches.push({ url, options });
        if (crm.status === 'throw') throw new Error('dns');
        return { getResponseCode: () => crm.status, getContentText: () => 'resp' };
      },
    },
  });
  runInContext(code, ctx);
  return {
    props, sheets, fetches, crm, drive,
    open: (params) => { const o = (runInContext('doGet', ctx) as (e: unknown) => { html: string; title: string })({ parameter: params }); return { title: o.title, html: o.html }; },
    post: (fields) => JSON.parse((runInContext('doPost', ctx) as (e: unknown) => { text: string })({ parameter: fields }).text) as Record<string, unknown>,
    postJson: (body) => JSON.parse((runInContext('doPost', ctx) as (e: unknown) => { text: string })({ postData: { type: 'application/json', contents: JSON.stringify(body) } }).text) as Record<string, unknown>,
    get: (params) => JSON.parse((runInContext('doGet', ctx) as (e: unknown) => { text: string })({ parameter: params }).text) as Record<string, unknown>,
    call: (fn) => { (runInContext(fn, ctx) as () => void)(); },
  };
}
