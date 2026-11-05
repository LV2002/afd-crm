import Papa from "papaparse";

/**
 * Reading punches from the three places they come from. Pure: text in,
 * punches out. Times from a device have no time zone, so they are read as
 * India time, which is what the institute runs on everywhere.
 */

export interface Punch {
  code: string;
  at: Date;
}

const IST_OFFSET = "+05:30";

/** "2026-11-03 09:41:05", "03/11/2026 9:41", "03-11-26 09:41:05 PM", or anything with its own offset. */
export function parsePunchTime(raw: string): Date | null {
  const text = raw.trim();
  if (!text) return null;

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text) && /^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let y: number, mo: number, d: number, rest: string;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(.*))?$/.exec(text);
  if (m) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); rest = m[4] ?? "";
  } else {
    // Indian dates are day first.
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T]+(.*))?$/.exec(text);
    if (!m) return null;
    d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]);
    if (y < 100) y += 2000;
    rest = m[4] ?? "";
  }

  let hh = 0, mm = 0, ss = 0;
  if (rest) {
    const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(rest.trim());
    if (!t) return null;
    hh = Number(t[1]); mm = Number(t[2]); ss = Number(t[3] ?? 0);
    if (t[4]) {
      const pm = t[4].toLowerCase() === "pm";
      if (hh === 12) hh = pm ? 12 : 0;
      else if (pm) hh += 12;
    }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59 || y < 2000 || y > 2100) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}${IST_OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject 31 February and the like, which Date would quietly roll over.
  if (new Date(date.getTime() + 5.5 * 3_600_000).getUTCDate() !== d) return null;
  return date;
}

export interface CsvPunches {
  punches: Punch[];
  skipped: number;
  error: string | null;
}

const CODE_HEADER = /^(emp(loyee)?\s*(code|id|no\.?|number)|user\s*id|person\s*id|pin|code|enroll(ment)?\s*(no|id)?|ac-?no\.?)$/i;
const DATETIME_HEADER = /(punch|log|check).*(date)?.*time|date\s*[/&-]?\s*time|datetime|^timestamp$/i;
const DATE_HEADER = /^(log\s*date|punch\s*date|date)$/i;
const TIME_HEADER = /^(log\s*time|punch\s*time|time|in\s*time)$/i;

/** An export from the eSSL software (or any log with an employee code and a time). Headers are matched by name. */
export function parsePunchCsv(text: string): CsvPunches {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
  const rows = parsed.data;
  let headerAt = -1;
  let code = -1, dt = -1, date = -1, time = -1;
  for (let i = 0; i < Math.min(rows.length, 15) && headerAt < 0; i++) {
    const cells = rows[i].map((c) => c.trim());
    const c = cells.findIndex((x) => CODE_HEADER.test(x));
    if (c < 0) continue;
    const d = cells.findIndex((x) => DATE_HEADER.test(x));
    const t = cells.findIndex((x) => TIME_HEADER.test(x));
    // Separate date and time columns win: "Log Time" alone would also look like a combined one.
    const combined = d >= 0 && t >= 0 ? -1 : cells.findIndex((x) => DATETIME_HEADER.test(x));
    if (combined >= 0 || (d >= 0 && t >= 0)) {
      headerAt = i; code = c; dt = combined; date = d; time = t;
    }
  }
  if (headerAt < 0) {
    return { punches: [], skipped: 0, error: "Couldn't find the columns. The file needs an employee code and either a date-and-time column or separate date and time columns." };
  }

  const punches: Punch[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerAt + 1)) {
    const codeText = (row[code] ?? "").trim();
    const when = dt >= 0 ? (row[dt] ?? "") : `${(row[date] ?? "").trim()} ${(row[time] ?? "").trim()}`;
    const at = parsePunchTime(when);
    if (!codeText || !at) {
      skipped += 1;
      continue;
    }
    punches.push({ code: codeText, at });
  }
  return { punches, skipped, error: punches.length === 0 ? "No punches were found in that file." : null };
}

/** The body a device pushes to its server: one line per punch, tab separated, the code first and the time second. */
export function parseDeviceAttLog(body: string): { punches: Punch[]; skipped: number } {
  const punches: Punch[] = [];
  let skipped = 0;
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split("\t");
    const at = cells.length >= 2 ? parsePunchTime(cells[1]) : null;
    const code = (cells[0] ?? "").trim();
    if (!code || !at) {
      skipped += 1;
      continue;
    }
    punches.push({ code, at });
  }
  return { punches, skipped };
}
