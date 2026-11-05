/**
 * The bank PDF reader, against statements drawn the way HDFC lays them out:
 * a header row, narration that wraps, right-aligned amounts, a header and
 * footer on every page, and a password. The PDFs are built here, in memory.
 */
import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";

import { parseBankPdf } from "../src/lib/finance/bank-statement-pdf";

interface Row {
  date: string;
  narration: string[];
  ref?: string;
  out?: string;
  inn?: string;
  balance: string;
}

const COL = { date: 40, narration: 95, ref: 275, value: 345, outRight: 450, inRight: 520, balRight: 590 };

function header(doc: PDFKit.PDFDocument, y: number) {
  doc.fontSize(8);
  doc.text("Date", COL.date, y, { lineBreak: false });
  doc.text("Narration", COL.narration, y, { lineBreak: false });
  doc.text("Chq./Ref.No.", COL.ref, y, { lineBreak: false });
  doc.text("Value Dt", COL.value, y, { lineBreak: false });
  doc.text("Withdrawal Amt.", COL.outRight - 70, y, { lineBreak: false, width: 70, align: "right" });
  doc.text("Deposit Amt.", COL.inRight - 60, y, { lineBreak: false, width: 60, align: "right" });
  doc.text("Closing Balance", COL.balRight - 70, y, { lineBreak: false, width: 70, align: "right" });
}

function buildPdf(pages: Row[][], password?: string): Promise<Uint8Array> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    ...(password ? { userPassword: password, ownerPassword: `${password}-owner` } : {}),
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Uint8Array>((resolve) => doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))));

  pages.forEach((rows, p) => {
    if (p > 0) doc.addPage();
    doc.fontSize(9).text("HDFC BANK LIMITED  Statement of account", 40, 30, { lineBreak: false });
    header(doc, 80);
    let y = 100;
    for (const r of rows) {
      doc.fontSize(8);
      doc.text(r.date, COL.date, y, { lineBreak: false });
      doc.text(r.narration[0], COL.narration, y, { lineBreak: false, width: 170 });
      doc.text(r.ref ?? "0000000000000000", COL.ref, y, { lineBreak: false });
      doc.text(r.date, COL.value, y, { lineBreak: false });
      if (r.out) doc.text(r.out, COL.outRight - 70, y, { lineBreak: false, width: 70, align: "right" });
      if (r.inn) doc.text(r.inn, COL.inRight - 60, y, { lineBreak: false, width: 60, align: "right" });
      doc.text(r.balance, COL.balRight - 70, y, { lineBreak: false, width: 70, align: "right" });
      for (const extra of r.narration.slice(1)) {
        y += 10;
        doc.text(extra, COL.narration, y, { lineBreak: false, width: 170 });
      }
      y += 16;
    }
    doc.fontSize(7).text(`Page ${p + 1} of ${pages.length}`, 40, 800, { lineBreak: false });
    doc.text("This is a computer generated statement and does not require a signature", 40, 810, { lineBreak: false });
  });
  doc.end();
  return done;
}

const PAGE_1: Row[] = [
  { date: "01/04/26", narration: ["UPI-RAHUL NAIR-rahul@okhdfc-", "HDFC0001234-609912345678-FEE"], ref: "0000609912345678", inn: "25,000.00", balance: "1,25,000.00" },
  { date: "02/04/26", narration: ["NEFT DR-SBIN0000123-KOCHI RENT"], ref: "N0123456789", out: "40,000.00", balance: "85,000.00" },
  { date: "03/04/26", narration: ["CHQ DEP - 000123 - TRIVANDRUM"], inn: "5,500.50", balance: "90,500.50" },
];
const PAGE_2: Row[] = [
  { date: "04/04/26", narration: ["POS 4012XXXXXXXX1234 STATIONERS"], out: "1,200.00", balance: "89,300.50" },
];

describe("parseBankPdf", () => {
  it("reads a password-protected statement across pages", async () => {
    const pdf = await buildPdf([PAGE_1, PAGE_2], "s3cret");
    const result = await parseBankPdf(pdf, "s3cret");
    expect(result.error).toBeNull();
    expect(result.lines).toHaveLength(4);
    const [a, b, c, d] = result.lines;
    expect(a).toMatchObject({ occurredOn: "2026-04-01", direction: "in", amountPaise: 2_500_000, balancePaise: 12_500_000 });
    // The wrapped narration is one line, in order.
    expect(a.particulars).toContain("UPI-RAHUL NAIR");
    expect(a.particulars).toContain("609912345678-FEE");
    expect(b).toMatchObject({ direction: "out", amountPaise: 4_000_000 });
    expect(c).toMatchObject({ direction: "in", amountPaise: 550_050 });
    expect(d).toMatchObject({ occurredOn: "2026-04-04", direction: "out", amountPaise: 120_000 });
    // Footers and page furniture never leak into a narration.
    for (const l of result.lines) expect(l.particulars).not.toMatch(/computer generated|Page \d/i);
  });

  it("asks for a password, and refuses a wrong one, without importing anything", async () => {
    const pdf = await buildPdf([PAGE_1], "s3cret");
    const none = await parseBankPdf(pdf, "");
    expect(none.error).toMatch(/password protected/i);
    const wrong = await parseBankPdf(pdf, "nope");
    expect(wrong.error).toMatch(/didn't open/i);
    expect(wrong.lines).toHaveLength(0);
  });

  it("refuses a file whose amounts do not follow the running balance", async () => {
    const bad: Row[] = [
      { ...PAGE_1[0] },
      { ...PAGE_1[1], balance: "99,999.00" },
    ];
    const result = await parseBankPdf(await buildPdf([bad]), "");
    expect(result.error).toMatch(/don't add up/i);
    expect(result.lines).toHaveLength(0);
  });

  it("refuses something that is not a PDF", async () => {
    const result = await parseBankPdf(new TextEncoder().encode("a,b,c"), "");
    expect(result.error).toMatch(/readable PDF/i);
  });

  it("gives the same fingerprints when the same statement is read twice", async () => {
    const a = await parseBankPdf(await buildPdf([PAGE_1]), "");
    const b = await parseBankPdf(await buildPdf([PAGE_1]), "");
    expect(a.lines.map((l) => l.fingerprint)).toEqual(b.lines.map((l) => l.fingerprint));
  });
});
