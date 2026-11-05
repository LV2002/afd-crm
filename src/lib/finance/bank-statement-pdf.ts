import {
  balanceMismatchRows,
  fingerprintOf,
  normalise,
  parseStatementAmount,
  parseStatementDate,
  type ParsedStatement,
  type SkippedRow,
  type StatementLine,
} from "./bank-statement";

/**
 * Reads a bank statement PDF — the kind net banking lets you download, with
 * text in it, optionally password protected — into the same lines the CSV
 * reader produces.
 *
 * Everything happens in memory. The password is used once to open the file
 * and is not kept, logged or returned; the file is discarded with the request.
 *
 * ## How it reads a table without a table
 *
 * A PDF has no rows and columns, only words at positions. The header line
 * ("Date  Narration  Chq./Ref.No.  Value Dt  Withdrawal Amt.  Deposit Amt.
 * Closing Balance") tells us where each column sits; every word below it is
 * then filed by where it is. A line that starts with a date begins a
 * transaction; the narration lines that follow it (banks wrap long ones) are
 * added to it until the next date. Page footers, the repeated header and the
 * summary block are recognised and never added to a narration.
 *
 * ## Why it refuses rather than guesses
 *
 * Money in the wrong column would be a credit recorded as a debit. Every line
 * carries the bank's running balance, so after reading the table the balance
 * is walked line by line: if any line's balance does not follow from the one
 * before it and its amount, the whole file is refused with the line numbers.
 * A statement that adds up end to end can only have been read correctly.
 */

interface Word {
  text: string;
  x: number;
  right: number;
  center: number;
  y: number;
}

interface RawTxn {
  date: string;
  narration: string[];
  ref: string;
  out: string;
  inn: string;
  balance: string;
  page: number;
}

const FOOTER = /^(page\s+\d|page no|statement summary|generated on|this is a computer|registered office|hdfc bank limited|end of statement|opening balance|closing balance\s*:|dr count|cr count|\*+\s*end)/i;
const DATE_TEXT = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{1,2}[ -][A-Za-z]{3}[ -,]*\d{2,4}$/;
const AMOUNT_TEXT = /^[\d,]+\.\d{2}$/;

function groupRows(words: Word[]): Word[][] {
  const sorted = [...words].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Word[][] = [];
  for (const w of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - w.y) <= 2.5) row.push(w);
    else rows.push([w]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

interface Layout {
  narrationX: number;
  refX: number | null;
  valueX: number | null;
  out: number;
  inn: number;
  balance: number;
  /** x boundary between the out/in columns and between in/balance. */
  outInSplit: number;
  inBalanceSplit: number;
  /** x boundary where the amount area begins. */
  amountsFrom: number;
}

function findHeader(rows: Word[][]): { index: number; layout: Layout } | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const find = (re: RegExp) => row.find((w) => re.test(w.text));
    const date = find(/^date$/i);
    const narration = find(/^(narration|particulars|description|details)$/i);
    const out = find(/^(withdrawal|debit)/i);
    const inn = find(/^(deposit|credit)/i);
    const balance = find(/^(closing|balance)/i);
    if (!date || !narration || !out || !inn || !balance) continue;
    const ref = find(/^(chq|ref|cheque)/i);
    const value = find(/^value$/i);
    return {
      index: i,
      layout: {
        narrationX: narration.x,
        refX: ref?.x ?? null,
        valueX: value?.x ?? null,
        out: out.center,
        inn: inn.center,
        balance: balance.center,
        outInSplit: (out.center + inn.center) / 2,
        inBalanceSplit: (inn.center + balance.center) / 2,
        amountsFrom: out.x - (inn.center - out.center) / 2,
      },
    };
  }
  return null;
}

export type PdfReadResult = ParsedStatement;

function fail(error: string): PdfReadResult {
  return { lines: [], skipped: [], balanceMismatches: 0, mismatchRows: [], error };
}

export async function parseBankPdf(data: Uint8Array, password: string): Promise<PdfReadResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: data.slice(),
      password: password || undefined,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    }).promise;
  } catch (error) {
    const e = error as { name?: string; code?: number };
    if (e?.name === "PasswordException") {
      return fail(
        e.code === 2
          ? "That password didn't open the statement. Check it and try again — nothing was imported."
          : "This statement is password protected. Enter its password next to the file.",
      );
    }
    return fail("That doesn't look like a readable PDF. Download the statement again from net banking.");
  }

  const raw: RawTxn[] = [];
  let sawText = false;
  let layout: Layout | null = null;

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const words: Word[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const text = item.str.trim();
      if (!text) continue;
      const x = item.transform[4];
      const width = item.width ?? 0;
      words.push({ text, x, right: x + width, center: x + width / 2, y: item.transform[5] });
    }
    if (words.length > 0) sawText = true;

    const rows = groupRows(words);
    const header = findHeader(rows);
    // The header repeats on every page. A page without one (a cover page, a
    // terms page) carries no transactions, unless an earlier page's layout
    // still applies to a continuation.
    if (header) layout = header.layout;
    if (!layout) continue;
    const start = header ? header.index + 1 : 0;

    let open: RawTxn | null = null;
    let lastY = 0;
    for (let r = start; r < rows.length; r++) {
      const row = rows[r];
      const rowText = row.map((w) => w.text).join(" ");

      if (FOOTER.test(rowText) && !row.some((w) => w.x < layout!.narrationX - 2 && DATE_TEXT.test(w.text))) {
        open = null;
        continue;
      }

      const dateWord = row.find((w) => w.right <= layout!.narrationX + 2 && DATE_TEXT.test(w.text));
      const narrationWords: string[] = [];
      let ref = "";
      let out = "";
      let inn = "";
      let balance = "";
      for (const w of row) {
        if (w === dateWord) continue;
        if (AMOUNT_TEXT.test(w.text) && w.center >= layout.amountsFrom) {
          if (w.center < layout.outInSplit) out = w.text;
          else if (w.center < layout.inBalanceSplit) inn = w.text;
          else balance = w.text;
        } else if (w.x >= layout.narrationX - 2 && w.x < (layout.refX ?? layout.valueX ?? layout.amountsFrom) - 2) {
          narrationWords.push(w.text);
        } else if (layout.refX !== null && w.x >= layout.refX - 2 && w.x < (layout.valueX ?? layout.amountsFrom) - 2) {
          ref += (ref ? " " : "") + w.text;
        }
        // Value date and anything else is ignored: the transaction date is the one that matters.
      }

      if (dateWord) {
        open = {
          date: dateWord.text,
          narration: narrationWords.length ? [narrationWords.join(" ")] : [],
          ref,
          out,
          inn,
          balance,
          page: pageNo,
        };
        raw.push(open);
        lastY = row[0].y;
        continue;
      }

      if (!open) continue;
      // A wrapped narration sits directly under its transaction. A big gap
      // means something else (a note, a summary) and is not part of it.
      if (lastY - row[0].y > 22) {
        open = null;
        continue;
      }
      if (narrationWords.length) open.narration.push(narrationWords.join(" "));
      if (!open.balance && balance) open.balance = balance;
      if (!open.out && !open.inn) {
        open.out = out;
        open.inn = inn;
      }
      if (ref && !open.ref) open.ref = ref;
      lastY = row[0].y;
    }
  }

  if (!sawText) {
    return fail(
      "This PDF has no readable text (it looks like a scan or a photo). Download the statement from net banking instead, or use the CSV.",
    );
  }
  if (!layout) {
    return fail(
      "Couldn't find the transaction table. The statement needs a header with Date, Narration, Withdrawal, Deposit and Balance columns.",
    );
  }

  const lines: StatementLine[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Map<string, number>();

  raw.forEach((t, i) => {
    const rowNo = i + 1;
    const occurredOn = parseStatementDate(t.date);
    const outP = t.out ? parseStatementAmount(t.out) : null;
    const inP = t.inn ? parseStatementAmount(t.inn) : null;
    const balancePaise = t.balance ? parseStatementAmount(t.balance) : null;
    let particulars = normalise(t.narration.join(" "));
    const ref = normalise(t.ref);
    // A reference of all zeros is the bank's way of saying there isn't one.
    if (ref && !/^0+$/.test(ref) && !particulars.toLowerCase().includes(ref.toLowerCase())) {
      particulars = `${particulars} Ref ${ref}`.trim();
    }

    if (!occurredOn) return void skipped.push({ row: rowNo, reason: `unreadable date "${t.date}"` });
    if (!particulars) return void skipped.push({ row: rowNo, reason: "no narration" });
    if ((outP && inP) || (!outP && !inP)) {
      return void skipped.push({ row: rowNo, reason: "couldn't tell if it was a credit or a debit" });
    }
    const direction = inP ? ("in" as const) : ("out" as const);
    const amountPaise = Math.abs((inP ?? outP) as number);

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
      note: null,
      dateGuessed: false,
      fingerprint: fingerprintOf({ occurredOn, direction, amountPaise, balancePaise, particulars, occurrence }),
    });
  });

  if (lines.length === 0) return fail("No transactions were found in that PDF.");

  // Skipped transaction rows are a refusal too: a line silently dropped is
  // money that would never be reconciled.
  if (skipped.length > 0) {
    return {
      ...fail(
        `Couldn't read ${skipped.length} transaction${skipped.length === 1 ? "" : "s"} in that PDF (${skipped
          .slice(0, 3)
          .map((s) => `#${s.row}: ${s.reason}`)
          .join("; ")}). Nothing was imported.`,
      ),
      skipped,
    };
  }

  if (lines.some((l) => l.balancePaise === null)) {
    return fail(
      "Couldn't read the running balance on every line, so the amounts can't be double-checked. Nothing was imported. Use the CSV from net banking instead.",
    );
  }

  const mismatchRows = balanceMismatchRows(lines);
  if (mismatchRows.length > 0) {
    return {
      ...fail(
        `The amounts on ${mismatchRows.length} line${mismatchRows.length === 1 ? "" : "s"} don't add up with the running balance (transactions ${mismatchRows
          .slice(0, 5)
          .join(", ")}${mismatchRows.length > 5 ? "…" : ""}), so the PDF may have been read wrongly. Nothing was imported. Use the CSV from net banking instead.`,
      ),
      balanceMismatches: mismatchRows.length,
      mismatchRows,
    };
  }

  return { lines, skipped, error: null, balanceMismatches: 0, mismatchRows: [] };
}
