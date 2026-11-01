import { createHash } from "node:crypto";

import Papa from "papaparse";

/**
 * Reads a bank statement CSV into transaction lines — in memory, from a
 * string, and nothing else.
 *
 * The statement itself is never kept. The caller hands this the text of an
 * uploaded file; what comes back is plain data, and the file is gone the
 * moment the request ends. Only the individual lines the accountant will
 * categorise are saved, and those are the CRM's own records (date, narration,
 * direction, amount), not the bank's document. There is no bank login, no
 * account number kept, and no copy of the file on disk or in Storage.
 *
 * Banks disagree about layout, so nothing is positional. Columns are found by
 * their header names — a single Amount column plus a Credit/Debit type, or
 * separate Debit and Credit columns — and the header may sit a few rows down
 * under the bank's own title lines. Any rows that are not a transaction
 * (opening balance, totals, blank lines, footers) are skipped and counted, so
 * the preview can say what was left out instead of silently dropping it.
 */

export interface StatementLine {
  /** 1-based row in the uploaded file, for pointing at a line in the preview. Not saved. */
  row: number;
  /** ISO date, yyyy-mm-dd. */
  occurredOn: string;
  /** The bank's narration, whitespace collapsed. */
  particulars: string;
  direction: "in" | "out";
  amountPaise: number;
  /** Running balance after this line, when the statement gives one. */
  balancePaise: number | null;
  /** Anything the accountant had already written beside the row. */
  note: string | null;
  /** True when the file's year was unusable and was taken from the neighbouring rows. */
  dateGuessed: boolean;
  /** Stable identity of the line, so re-uploading an overlapping statement adds nothing twice. */
  fingerprint: string;
}

export interface SkippedRow {
  /** 1-based row number in the file, as a spreadsheet shows it. */
  row: number;
  reason: string;
}

export interface ParsedStatement {
  lines: StatementLine[];
  skipped: SkippedRow[];
  /** Set when the header could not be understood at all. */
  error: string | null;
  /**
   * Rows whose balance does not follow from the one before. Zero means the
   * statement adds up end to end, which is the strongest sign nothing was
   * misread; anything else is shown as a warning, never a block.
   */
  balanceMismatches: number;
  /** File rows where the balance breaks, so they can be checked by eye. */
  mismatchRows: number[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Indian statements are day-first: 03/04/2026 is the 3rd of April. A
 * month-first reading would silently swap days and months for every date up
 * to the 12th, which is the quietest possible way to corrupt a ledger.
 */
export function parseStatementDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[-/ .]([A-Za-z]{3,9})[-/ .,]+(\d{2,4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(year, month, Number(m[1]));
  }

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s+[\d:]+)?$/.exec(text);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(year, Number(m[2]), Number(m[1]));
  }
  return null;
}

/**
 * Day and month of a date whose year cannot be trusted. One real statement
 * carries `31-Aug-0202` on four rows; dropping them would lose real money, so
 * the caller borrows the year from the nearest good row and says so.
 */
function dayAndMonthOf(raw: string): { day: number; month: number } | null {
  const text = raw.trim();
  let m = /^(\d{1,2})[-/ .]([A-Za-z]{3,9})[-/ .,]+\d{1,4}$/.exec(text);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return month ? { day: Number(m[1]), month } : null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{1,4}(?:\s+[\d:]+)?$/.exec(text);
  return m ? { day: Number(m[1]), month: Number(m[2]) } : null;
}

/**
 * "₹1,416.00", "Rs. 20", "1,416.00 Cr", "(500.00)" → paise. Integer maths on
 * the digits, never a float, so ₹0.10 is exactly 10 paise.
 */
export function parseStatementAmount(raw: string): number | null {
  let text = raw.trim().replace(/^([^\d]*[\d,]*\d)\s(\d{2})$/, "$1.$2");
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
  text = text.replace(/[₹,\s()+-]|rs\.?|inr|\b(cr|dr)\b\.?/gi, "");
  if (!/^\d+(\.\d{1,})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
  if (!Number.isSafeInteger(paise)) return null;
  return negative ? -paise : paise;
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

interface Columns {
  date: number;
  particulars: number;
  /** Single amount column with a separate credit/debit marker. */
  amount: number | null;
  type: number | null;
  /** Separate columns, when the bank splits money in and money out. */
  debit: number | null;
  credit: number | null;
  balance: number | null;
  /** First column after the bank's own; anything from here on is the accountant's own writing. */
  trailingFrom: number;
}

function findColumns(header: string[]): Columns | null {
  const cells = header.map((c) => normalise(c).toLowerCase());
  const find = (...tests: RegExp[]): number | null => {
    const hit = cells.findIndex((c) => c && tests.some((t) => t.test(c)));
    return hit === -1 ? null : hit;
  };

  const particulars = find(/particulars|narration|description|details|remarks/);
  const debit = find(/^(debit|withdrawal|withdrawals|dr)\b/, /withdrawal amt/);
  const credit = find(/^(credit|deposit|deposits|cr)\b/, /deposit amt/);
  const amount = find(/^amount/);
  const type = find(/transaction type|^type$|dr\s*\/\s*cr|cr\s*\/\s*dr/);
  const balance = find(/balance/);
  // The bank's own date column is named; the statement example puts the
  // period start in the first cell instead, so fall back to column 0.
  const dateHeader = find(/\bdate\b/);

  if (particulars === null) return null;
  const hasSplit = debit !== null && credit !== null;
  const hasSingle = amount !== null && type !== null;
  if (!hasSplit && !hasSingle) return null;

  const known = [particulars, amount, type, debit, credit, balance].filter((n): n is number => n !== null);
  const trailingFrom = Math.max(...known) + 1;

  return {
    date: dateHeader ?? 0,
    particulars,
    amount: hasSplit ? null : amount,
    type: hasSplit ? null : type,
    debit: hasSplit ? debit : null,
    credit: hasSplit ? credit : null,
    balance,
    trailingFrom,
  };
}

function fingerprintOf(parts: {
  occurredOn: string;
  direction: string;
  amountPaise: number;
  balancePaise: number | null;
  particulars: string;
  occurrence: number;
}): string {
  const key = [
    parts.occurredOn,
    parts.direction,
    parts.amountPaise,
    parts.balancePaise ?? "",
    parts.particulars.toLowerCase(),
    parts.occurrence,
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}

/** Year of the closest row above (else below) whose date reads cleanly. */
function neighbourYear(rows: string[][], at: number, dateCol: number): number | null {
  const yearAt = (n: number): number | null => {
    const d = parseStatementDate(rows[n]?.[dateCol] ?? "");
    return d ? Number(d.slice(0, 4)) : null;
  };
  for (let n = at - 1; n >= Math.max(0, at - 6); n--) {
    const y = yearAt(n);
    if (y) return y;
  }
  for (let n = at + 1; n < Math.min(rows.length, at + 7); n++) {
    const y = yearAt(n);
    if (y) return y;
  }
  return null;
}

export function parseBankStatement(csvText: string): ParsedStatement {
  const result = Papa.parse<string[]>(csvText.replace(/^﻿/, ""), {
    skipEmptyLines: false,
  });
  const rows = result.data;

  let columns: Columns | null = null;
  let headerAt = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const found = findColumns(rows[i]);
    if (found) {
      columns = found;
      headerAt = i;
      break;
    }
  }
  if (!columns) {
    return {
      lines: [],
      skipped: [],
      balanceMismatches: 0,
      mismatchRows: [],
      error:
        "Couldn't find the columns. The file needs a Particulars (or Narration) column, and either Amount with a Credit/Debit type, or separate Debit and Credit columns.",
    };
  }

  const lines: StatementLine[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Map<string, number>();

  for (let i = headerAt + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 1;
    if (row.every((c) => !c?.trim())) continue;

    const rawDate = row[columns.date] ?? "";
    let occurredOn = parseStatementDate(rawDate);
    let dateGuessed = false;
    if (!occurredOn) {
      const partial = dayAndMonthOf(rawDate);
      const year = partial ? neighbourYear(rows, i, columns.date) : null;
      occurredOn = partial && year ? validDate(year, partial.month, partial.day) : null;
      dateGuessed = occurredOn !== null;
    }
    if (!occurredOn) {
      skipped.push({ row: rowNo, reason: "no date — looks like a heading, total or footer" });
      continue;
    }
    const particulars = normalise(row[columns.particulars] ?? "");
    if (!particulars) {
      skipped.push({ row: rowNo, reason: "no particulars" });
      continue;
    }

    let direction: "in" | "out" | null = null;
    let amountPaise: number | null = null;

    if (columns.amount !== null && columns.type !== null) {
      const marker = normalise(row[columns.type] ?? "").toLowerCase();
      if (/^(cr|credit|c)\b/.test(marker)) direction = "in";
      else if (/^(dr|debit|d)\b/.test(marker)) direction = "out";
      amountPaise = parseStatementAmount(row[columns.amount] ?? "");
    } else if (columns.debit !== null && columns.credit !== null) {
      const out = parseStatementAmount(row[columns.debit] ?? "");
      const inn = parseStatementAmount(row[columns.credit] ?? "");
      if (inn && !out) {
        direction = "in";
        amountPaise = inn;
      } else if (out && !inn) {
        direction = "out";
        amountPaise = out;
      }
    }

    if (!direction || amountPaise === null || amountPaise === 0) {
      skipped.push({ row: rowNo, reason: "couldn't tell if it was a credit or a debit, or the amount is missing" });
      continue;
    }
    amountPaise = Math.abs(amountPaise);

    const balancePaise =
      columns.balance === null ? null : parseStatementAmount(row[columns.balance] ?? "");
    // The accountant's old Income / Expense / Notes columns sit after the
    // bank's own. Their words are kept as a note: "lamiya faizal-3540" is
    // exactly what makes categorising the row quick.
    const note =
      row
        .slice(columns.trailingFrom)
        .map((c) => normalise(c ?? ""))
        .filter(Boolean)
        .join(" · ") || null;

    // Only needed when there is no balance to tell two identical rows apart.
    const baseKey = [occurredOn, direction, amountPaise, balancePaise ?? "", particulars.toLowerCase()].join("|");
    const occurrence = balancePaise === null ? (seen.get(baseKey) ?? 0) : 0;
    seen.set(baseKey, occurrence + 1);

    lines.push({
      row: rowNo,
      occurredOn,
      particulars,
      direction,
      amountPaise,
      balancePaise,
      note,
      dateGuessed,
      fingerprint: fingerprintOf({ occurredOn, direction, amountPaise, balancePaise, particulars, occurrence }),
    });
  }

  const mismatchRows = balanceMismatchRows(lines);
  return { lines, skipped, error: null, balanceMismatches: mismatchRows.length, mismatchRows };
}

/**
 * Rows whose balance does not equal the one before ± their amount. Statements
 * run oldest-first or newest-first, so both orders are tried and the better
 * one wins. Lines without a balance are not judged.
 */
export function balanceMismatchRows(lines: StatementLine[]): number[] {
  const withBalance = lines.filter((l) => l.balancePaise !== null);
  if (withBalance.length < 2) return [];

  const check = (ordered: StatementLine[]): number[] => {
    const bad: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1].balancePaise as number;
      const cur = ordered[i];
      const expected = prev + (cur.direction === "in" ? cur.amountPaise : -cur.amountPaise);
      if (expected !== cur.balancePaise) bad.push(cur.row);
    }
    return bad;
  };

  const forward = check(withBalance);
  const backward = check([...withBalance].reverse());
  return forward.length <= backward.length ? forward : backward;
}
