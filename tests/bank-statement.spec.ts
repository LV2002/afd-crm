import { describe, expect, it } from "vitest";

import {
  parseBankStatement,
  parseStatementAmount,
  parseStatementDate,
} from "@/lib/finance/bank-statement";

const SAMPLE = [
  "13-May-2026,Particulars Account No:  50200068408272,Transaction Type,Amount,Balance,Notes,,",
  ",,,,,Income,Expense,Notes",
  '29-Oct-2026,FT IMPS/IFI/630301068913/- GOOGLEINDIADIGITALSERVIC,Credit,₹20.00,3205120.84,"fine   ameen-10,dhyan pb-10",,',
  '29-Oct-2026,NFT/FBBT263026528850 Leon Vinny Koonthamattom SBIN,Debit,"₹1,416.00",3205100.84,,leon vinny-idesign tutorials,',
  '28-Oct-2026,"IMPS/IFI/630101837929/GOOGLEINDIADIGITALSE\nRVICE",Credit,"₹47,910.00",3206516.84,"lamiya faizal-3540",,',
  "",
  "END OF MONTH,,,,,,,",
].join("\n");

describe("parseStatementDate", () => {
  it("reads the formats Indian banks print, day first", () => {
    expect(parseStatementDate("29-Oct-2026")).toBe("2026-10-29");
    expect(parseStatementDate("03/04/2026")).toBe("2026-04-03");
    expect(parseStatementDate("3-4-26")).toBe("2026-04-03");
    expect(parseStatementDate("2026-04-03")).toBe("2026-04-03");
    expect(parseStatementDate("5 Nov 2026")).toBe("2026-11-05");
  });
  it("rejects what is not a date", () => {
    expect(parseStatementDate("END OF MONTH")).toBeNull();
    expect(parseStatementDate("31/02/2026")).toBeNull();
    expect(parseStatementDate("")).toBeNull();
  });
});

describe("parseStatementAmount", () => {
  it("handles symbols, commas and suffixes without floats", () => {
    expect(parseStatementAmount("₹1,416.00")).toBe(141600);
    expect(parseStatementAmount("Rs. 20")).toBe(2000);
    expect(parseStatementAmount("0.10")).toBe(10);
    expect(parseStatementAmount("1,00,000.50 Cr")).toBe(10000050);
    expect(parseStatementAmount("(500.00)")).toBe(-50000);
  });
  it("returns null for blanks and junk", () => {
    expect(parseStatementAmount("")).toBeNull();
    expect(parseStatementAmount("abc")).toBeNull();
  });
});

describe("parseBankStatement", () => {
  const parsed = parseBankStatement(SAMPLE);

  it("finds the columns under the bank's title row", () => {
    expect(parsed.error).toBeNull();
    expect(parsed.lines).toHaveLength(3);
  });

  it("reads direction, amount and balance", () => {
    expect(parsed.lines[0]).toMatchObject({
      occurredOn: "2026-10-29",
      direction: "in",
      amountPaise: 2000,
      balancePaise: 320512084,
    });
    expect(parsed.lines[1]).toMatchObject({ direction: "out", amountPaise: 141600 });
  });

  it("joins a particulars cell that wraps over two lines", () => {
    expect(parsed.lines[2].particulars).toBe("IMPS/IFI/630101837929/GOOGLEINDIADIGITALSE RVICE");
  });

  it("keeps the accountant's own words as a note", () => {
    expect(parsed.lines[0].note).toBe("fine ameen-10,dhyan pb-10");
    expect(parsed.lines[1].note).toBe("leon vinny-idesign tutorials");
  });

  it("skips and counts rows that are not transactions", () => {
    expect(parsed.skipped.map((s) => s.row)).toEqual([2, 7]);
  });

  it("flags balances that do not follow", () => {
    expect(parsed.balanceMismatches).toBe(0);
    const broken = parseBankStatement(SAMPLE.replace("3205100.84", "999.00"));
    expect(broken.balanceMismatches).toBeGreaterThan(0);
  });

  it("gives the same fingerprint on re-upload and a different one for a different row", () => {
    const again = parseBankStatement(SAMPLE);
    expect(again.lines.map((l) => l.fingerprint)).toEqual(parsed.lines.map((l) => l.fingerprint));
    expect(new Set(parsed.lines.map((l) => l.fingerprint)).size).toBe(3);
  });

  it("keeps two identical rows apart when there is no balance column", () => {
    const csv = [
      "Date,Narration,Debit,Credit",
      "01/05/2026,UPI/ABC,100.00,",
      "01/05/2026,UPI/ABC,100.00,",
    ].join("\n");
    const p = parseBankStatement(csv);
    expect(p.lines).toHaveLength(2);
    expect(p.lines[0].fingerprint).not.toBe(p.lines[1].fingerprint);
  });

  it("supports separate debit and credit columns", () => {
    const csv = ["Txn Date,Description,Withdrawal Amt.,Deposit Amt.,Balance", "01/05/26,RENT,5000.00,,95000.00", "02/05/26,FEES,,2500.00,97500.00"].join("\n");
    const p = parseBankStatement(csv);
    expect(p.lines.map((l) => [l.direction, l.amountPaise])).toEqual([["out", 500000], ["in", 250000]]);
    expect(p.balanceMismatches).toBe(0);
  });

  it("explains itself when the file is not a statement", () => {
    expect(parseBankStatement("a,b\n1,2").error).toMatch(/Couldn't find the columns/);
  });
});

describe("a year the bank mistyped", () => {
  it("keeps the row, borrows the year from its neighbours and says so", () => {
    const csv = [
      "Date,Particulars,Transaction Type,Amount,Balance",
      "1-Sep-2026,A,Debit,10.00,90.00",
      "31-Aug-0202,B,Credit,50.00,100.00",
      "30-Aug-2026,C,Credit,50.00,50.00",
    ].join("\n");
    const p = parseBankStatement(csv);
    expect(p.lines).toHaveLength(3);
    expect(p.lines[1]).toMatchObject({ occurredOn: "2026-08-31", dateGuessed: true });
    expect(p.lines[0].dateGuessed).toBe(false);
    expect(p.balanceMismatches).toBe(0);
  });
});
