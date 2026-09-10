/**
 * An amount written out on a receipt.
 *
 * Two things worth a test each. The helper takes **paise**, like every
 * other money value in this system — one that quietly expected rupees
 * would print four hundred rupees where forty thousand was paid, on the
 * one document nobody re-reads. And the numbering is Indian: lakh and
 * crore, because "four hundred fifty thousand" is a foreign document that
 * happens to be in rupees.
 */
import { describe, expect, it } from "vitest";

import { amountInWords, rupeesInWords } from "../src/lib/format/words";

describe("rupeesInWords", () => {
  it("handles the small numbers, including the irregular teens", () => {
    expect(rupeesInWords(0)).toBe("zero");
    expect(rupeesInWords(7)).toBe("seven");
    expect(rupeesInWords(13)).toBe("thirteen");
    expect(rupeesInWords(20)).toBe("twenty");
    expect(rupeesInWords(42)).toBe("forty two");
    expect(rupeesInWords(100)).toBe("one hundred");
    expect(rupeesInWords(999)).toBe("nine hundred ninety nine");
  });

  it("counts in lakh and crore, not millions", () => {
    expect(rupeesInWords(45_000)).toBe("forty five thousand");
    expect(rupeesInWords(1_00_000)).toBe("one lakh");
    expect(rupeesInWords(4_50_000)).toBe("four lakh fifty thousand");
    expect(rupeesInWords(1_00_00_000)).toBe("one crore");
    expect(rupeesInWords(2_50_75_000)).toBe("two crore fifty lakh seventy five thousand");
  });

  it("skips the groups that are empty rather than saying zero lakh", () => {
    expect(rupeesInWords(1_00_00_500)).toBe("one crore five hundred");
  });
});

describe("amountInWords", () => {
  it("takes paise, not rupees", () => {
    // The whole point. 4_500_000 paise is ₹45,000 — a helper that read
    // this as rupees would print forty five lakh on the receipt.
    expect(amountInWords(45_000_00)).toBe("Forty five thousand");
  });

  it("says the paise only when there are any", () => {
    expect(amountInWords(1_000_00)).toBe("One thousand");
    expect(amountInWords(1_000_50)).toBe("One thousand and fifty paise");
  });

  it("starts with a capital, because it goes straight onto a document", () => {
    expect(amountInWords(500_00).startsWith("F")).toBe(true);
  });

  it("writes a reversal as a positive amount — the document says it is a reversal", () => {
    expect(amountInWords(-5_000_00)).toBe("Five thousand");
  });

  it("is zero rather than broken for nonsense", () => {
    expect(amountInWords(Number.NaN)).toBe("zero");
    expect(amountInWords(0)).toBe("Zero");
  });
});
