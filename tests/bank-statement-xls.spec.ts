import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseBankStatement } from "@/lib/finance/bank-statement";
import { looksLikeXls, readXlsRows, xlsToCsv, XlsReadError } from "@/lib/finance/bank-statement-xls";

// A made-up statement (no real account or person) written with an Excel
// writer: 120 long narrations, enough that the shared string table spills
// across CONTINUE records, and a header sitting under a few title rows.
const example = new Uint8Array(readFileSync(join(__dirname, "fixtures/example-statement.xls")));

describe("reading an old Excel (.xls) statement", () => {
  it("recognises the file type by its signature, not its name", () => {
    expect(looksLikeXls(example)).toBe(true);
    expect(looksLikeXls(new TextEncoder().encode("Date,Narration"))).toBe(false);
  });

  it("returns the first sheet as rows of text", () => {
    const rows = readXlsRows(example);
    expect(rows[0][0]).toBe("EXAMPLE BANK Ltd.");
    expect(rows[5].slice(0, 2)).toEqual(["Date", "Narration"]);
  });

  it("keeps strings whole across continued records, including non-ASCII text", () => {
    const rows = readXlsRows(example);
    const last = rows[7 + 119];
    expect(last[1]).toContain("café");
    expect(last[1]).toContain("₹");
    expect(last[1]).toContain("119 ");
    expect(last[0]).toBe("08/04/26");
  });

  it("feeds the statement parser: every line found, the balance running true", () => {
    const parsed = parseBankStatement(xlsToCsv(example));
    expect(parsed.error).toBeNull();
    expect(parsed.lines).toHaveLength(120);
    expect(parsed.balanceMismatches).toBe(0);
    expect(parsed.lines.filter((l) => l.direction === "out")).toHaveLength(40);
    expect(parsed.lines.filter((l) => l.direction === "in")).toHaveLength(80);
  });

  it("refuses something that is not a spreadsheet, plainly", () => {
    expect(() => readXlsRows(new Uint8Array(600))).toThrow(XlsReadError);
  });

  it("refuses a truncated file rather than returning half of it", () => {
    expect(() => readXlsRows(example.slice(0, 2048))).toThrow(XlsReadError);
  });
});

describe("a bank's address block above the header", () => {
  it("finds the header when it is well below the first row", () => {
    const preamble = Array.from({ length: 25 }, (_, i) => `Bank line ${i}`).join("\n");
    const csv = `${preamble}\nDate,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance\n01/04/26,Coffee,50.00,,950.00\n`;
    const parsed = parseBankStatement(csv);
    expect(parsed.error).toBeNull();
    expect(parsed.lines).toHaveLength(1);
  });
});
