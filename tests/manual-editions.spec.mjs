import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  allHeadingNumbers,
  declaredAudience,
  numbering,
  renumber,
  selectForAudience,
} from "../docs/manual/build.mjs";

/**
 * The manual ships as two books from one set of chapters, and the thing
 * that can go wrong quietly is a staff book that still carries
 * administrator material, or a cross-reference pointing at a chapter
 * that book does not have. Both are invisible until somebody reads it.
 */

const chapter = (body) => [{ file: "x.md", source: body }];

describe("audience selection", () => {
  it("reads a whole-chapter marker off the first line", () => {
    expect(declaredAudience("<!-- audience: admin -->\n# Chapter 1 — X\n")).toBe("admin");
    expect(declaredAudience("# Chapter 1 — X\n")).toBe("all");
    // Not the first line: not front matter.
    expect(declaredAudience("# Chapter 1 — X\n<!-- audience: admin -->\n")).toBe("all");
  });

  it("keeps a region for its own audience and drops it for the other", () => {
    const source = ["Shared.", "", "<!-- only: admin -->", "Secret.", "<!-- /only -->", "", "After."].join("\n");
    expect(selectForAudience(source, "admin", "x.md")).toContain("Secret.");
    expect(selectForAudience(source, "staff", "x.md")).not.toContain("Secret.");
  });

  it("leaves a blank line where a region was cut, so paragraphs do not merge", () => {
    const source = ["Before.", "<!-- only: admin -->", "Secret.", "<!-- /only -->", "After."].join("\n");
    expect(selectForAudience(source, "staff", "x.md")).toBe("Before.\n\nAfter.");
  });

  it("does not split a list in half when the cut is between bullets", () => {
    const source = ["- one", "<!-- only: admin -->", "- secret", "<!-- /only -->", "- two"].join("\n");
    expect(selectForAudience(source, "staff", "x.md")).toBe("- one\n- two");
  });

  it("treats directives inside a fence as text, because Chapter 19 prints them", () => {
    const source = ["```", "<!-- only: admin -->", "```", "Kept."].join("\n");
    expect(selectForAudience(source, "staff", "x.md")).toContain("<!-- only: admin -->");
  });

  it("fails loudly on a region nobody closed", () => {
    expect(() => selectForAudience("<!-- only: admin -->\nx\n", "staff", "x.md")).toThrow(/never closed/);
    expect(() => selectForAudience("<!-- /only -->\n", "staff", "x.md")).toThrow(/no region open/);
    expect(() =>
      selectForAudience("<!-- only: admin -->\n<!-- only: staff -->\n<!-- /only -->\n", "staff", "x.md"),
    ).toThrow(/do not nest/);
  });
});

describe("renumbering", () => {
  const book = [
    { file: "a.md", source: "# Chapter 5 — Leads\n\n## 5.1 The list\n\n## 5.2 The board\n" },
    { file: "b.md", source: "# Chapter 9 — Finance\n\n## 9.1 Tabs\n" },
  ];

  it("numbers chapters and sections by position, not by what was typed", () => {
    const { chapterMap, sectionMap } = numbering(book);
    expect(chapterMap.get("5")).toBe("1");
    expect(chapterMap.get("9")).toBe("2");
    expect(sectionMap.get("5.2")).toBe("1.2");
    expect(sectionMap.get("9.1")).toBe("2.1");
  });

  it("collapses a letter-suffixed section into the sequence", () => {
    const { sectionMap } = numbering(
      chapter("# Chapter 7 — Fees\n\n## 7.3 Plan\n\n## 7.3a Changes\n\n## 7.4 Payment\n"),
    );
    expect(sectionMap.get("7.3a")).toBe("1.2");
    expect(sectionMap.get("7.4")).toBe("1.3");
  });

  it("refuses a section numbered for a different chapter", () => {
    expect(() => numbering(chapter("# Chapter 7 — Fees\n\n## 8.1 Oops\n"))).toThrow(/is numbered for chapter 8/);
  });

  it("rewrites headings and every shape of cross-reference", () => {
    const maps = numbering(book);
    const known = new Set(["5", "9", "5.1", "5.2", "9.1", "13"]);
    const text = renumber(
      "# Chapter 9 — Finance\n\nSee Chapter 5, and Chapter 5.2, and (5.1). Chapter 13 has the rest.\n",
      maps,
      known,
      "the administrator handbook",
    );
    expect(text).toContain("# Chapter 2 — Finance");
    expect(text).toContain("See Chapter 1, and Chapter 1.2, and (1.1).");
    expect(text).toContain("the administrator handbook has the rest.");
  });

  it("leaves numbers that are not references alone", () => {
    const maps = numbering(book);
    const text = renumber(
      "A phone imported as `9.85E+09`, version 2.1, and 99.9% of leads.\n",
      maps,
      new Set(["5", "9"]),
      "elsewhere",
    );
    expect(text).toContain("9.85E+09");
    expect(text).toContain("version 2.1");
    expect(text).toContain("99.9%");
  });
});

describe("the chapters as they actually are", () => {
  const here = new URL("../docs/manual/", import.meta.url);
  const read = (name) => readFileSync(new URL(name, here), "utf8");

  it("knows every chapter and section number in the manual", () => {
    const keys = allHeadingNumbers(["13-admin-guide.md"]);
    expect(keys.has("13")).toBe(true);
    expect(keys.has("13.7")).toBe(true);
  });

  it("builds a staff book with no administrator material left in it", () => {
    const staff = read("manual-staff.html");

    // Run `npm run manual` after editing a chapter; the built books are
    // committed because that is what the /manual routes serve.
    expect(staff).toContain("The staff handbook");
    // A runbook path in the staff book means a region was never marked.
    expect(staff).not.toMatch(/docs\/[A-Z-]+\.md/);
    expect(staff).not.toContain("Chapter 13 — Admin guide");
    expect(staff).not.toContain("Coexistence — a counsellor");
  });

  it("builds an administrator book that keeps it", () => {
    const admin = read("manual-admin.html");
    expect(admin).toContain("The administrator handbook");
    expect(admin).toContain("Admin guide");
    expect(admin).toMatch(/docs\/CRON-SETUP\.md/);
  });
});
