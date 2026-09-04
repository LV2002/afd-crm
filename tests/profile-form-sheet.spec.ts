import { describe, expect, it } from "vitest";

import {
  UNANSWERED,
  answerText,
  compareAnswers,
  defaultColumnKeys,
  isBlank,
  isSheetColumn,
  matchesColumnFilter,
  type SheetColumn,
} from "@/lib/profile-form/sheet";

const column = (over: Partial<SheetColumn> & Pick<SheetColumn, "key" | "type">): SheetColumn => ({
  label: over.key,
  options: [],
  ...over,
});

const CITY = column({ key: "city", type: "text", label: "City" });
const BATCH = column({
  key: "current_batch_id",
  type: "select",
  label: "Batch",
  options: [
    { value: "uuid-a", label: "Kochi Morning" },
    { value: "uuid-b", label: "Kannur Evening" },
  ],
});
const EXAMS = column({
  key: "target_exams",
  type: "multiselect",
  label: "Exams",
  options: [
    { value: "nid", label: "NID" },
    { value: "nift_ug", label: "NIFT UG" },
  ],
});
const PERCENT = column({ key: "percentage_12th", type: "number", label: "12th %" });
const DOB = column({ key: "dob", type: "date", label: "DOB" });

describe("isSheetColumn", () => {
  it("allows the answers worth putting in a grid", () => {
    expect(isSheetColumn(CITY)).toBe(true);
    expect(isSheetColumn(BATCH)).toBe(true);
    expect(isSheetColumn(PERCENT)).toBe(true);
    expect(isSheetColumn(DOB)).toBe(true);
  });

  // A sheet of phone numbers is the bulk contact export CLAUDE.md
  // non-negotiable #6 exists to prevent.
  it("keeps contact details, files and paragraphs out of the grid", () => {
    for (const type of ["phone", "email", "url", "file", "long_text"] as const) {
      expect(isSheetColumn({ type })).toBe(false);
    }
  });
});

describe("isBlank", () => {
  it("treats null, whitespace and an empty list as unanswered", () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank("  ")).toBe(true);
    expect(isBlank([])).toBe(true);
    expect(isBlank(["", " "])).toBe(true);
  });

  it("does not treat a real answer as blank", () => {
    expect(isBlank("Kochi")).toBe(false);
    expect(isBlank(0)).toBe(false);
    expect(isBlank(false)).toBe(false);
    expect(isBlank(["NID"])).toBe(false);
  });
});

describe("answerText", () => {
  it("resolves an id to the name a person reads", () => {
    expect(answerText(BATCH, "uuid-a")).toBe("Kochi Morning");
  });

  it("joins a multi-answer, resolving each value", () => {
    expect(answerText(EXAMS, ["nid", "nift_ug"])).toBe("NID, NIFT UG");
  });

  it("falls back to the stored value when no option matches", () => {
    expect(answerText(BATCH, "uuid-gone")).toBe("uuid-gone");
    expect(answerText(CITY, " Ernakulam ")).toBe("Ernakulam");
  });

  it("renders an unanswered question as nothing at all", () => {
    expect(answerText(CITY, null)).toBe("");
  });
});

describe("matchesColumnFilter", () => {
  it("passes everything when the column isn't filtered", () => {
    expect(matchesColumnFilter(CITY, "Kochi", "")).toBe(true);
  });

  it("matches a dropdown answer exactly, on the stored value", () => {
    expect(matchesColumnFilter(BATCH, "uuid-a", "uuid-a")).toBe(true);
    expect(matchesColumnFilter(BATCH, "uuid-b", "uuid-a")).toBe(false);
  });

  it("matches a multi-answer if it holds the value at all", () => {
    expect(matchesColumnFilter(EXAMS, ["nid", "nift_ug"], "nift_ug")).toBe(true);
    expect(matchesColumnFilter(EXAMS, ["nid"], "nift_ug")).toBe(false);
  });

  it("matches free text on a substring, case-insensitively", () => {
    expect(matchesColumnFilter(CITY, "Ernakulam", "ERNA")).toBe(true);
    expect(matchesColumnFilter(CITY, "Ernakulam", "Kannur")).toBe(false);
  });

  it("makes unanswered something you can filter for", () => {
    expect(matchesColumnFilter(CITY, null, UNANSWERED)).toBe(true);
    expect(matchesColumnFilter(CITY, "Kochi", UNANSWERED)).toBe(false);
  });

  it("excludes an unanswered row from any positive filter", () => {
    expect(matchesColumnFilter(CITY, null, "Kochi")).toBe(false);
    expect(matchesColumnFilter(BATCH, null, "uuid-a")).toBe(false);
  });
});

describe("compareAnswers", () => {
  function sorted(col: SheetColumn, values: unknown[], ascending: boolean): unknown[] {
    return [...values].sort((a, b) => compareAnswers(col, a, b, ascending));
  }

  it("sorts numbers numerically, not as strings", () => {
    expect(sorted(PERCENT, [9, 78, 100], true)).toEqual([9, 78, 100]);
    expect(sorted(PERCENT, [9, 78, 100], false)).toEqual([100, 78, 9]);
  });

  it("sorts dates chronologically", () => {
    expect(sorted(DOB, ["2007-03-01", "2005-12-31"], true)).toEqual([
      "2005-12-31",
      "2007-03-01",
    ]);
  });

  it("sorts an option-backed column by its label, not by the uuid behind it", () => {
    // uuid-a sorts before uuid-b, but "Kannur Evening" sorts before
    // "Kochi Morning" — the reader can only see the labels.
    expect(sorted(BATCH, ["uuid-a", "uuid-b"], true)).toEqual(["uuid-b", "uuid-a"]);
  });

  // A blank is missing, not smallest: flipping the sort to hunt for the
  // unanswered rows is nobody's intent.
  it("sinks unanswered rows to the bottom in both directions", () => {
    expect(sorted(CITY, ["Kochi", null, "Alappuzha"], true)).toEqual([
      "Alappuzha",
      "Kochi",
      null,
    ]);
    expect(sorted(CITY, ["Kochi", null, "Alappuzha"], false)).toEqual([
      "Kochi",
      "Alappuzha",
      null,
    ]);
  });

  it("leaves two blanks in the order it found them", () => {
    expect(compareAnswers(CITY, null, "", true)).toBe(0);
  });
});

describe("defaultColumnKeys", () => {
  const withTick = (key: string, showInList: boolean) => ({
    ...column({ key, type: "text" as const }),
    showInList,
  });

  it("opens with whatever an admin ticked Show in list", () => {
    expect(
      defaultColumnKeys([withTick("city", true), withTick("state", false), withTick("batch", true)]),
    ).toEqual(["city", "batch"]);
  });

  it("falls back to the first few questions so the sheet is never bare", () => {
    const untouched = ["a", "b", "c", "d", "e"].map((key) => withTick(key, false));
    expect(defaultColumnKeys(untouched)).toEqual(["a", "b", "c", "d"]);
    expect(defaultColumnKeys(untouched, 2)).toEqual(["a", "b"]);
  });

  it("copes with a form that has no columnable questions at all", () => {
    expect(defaultColumnKeys([])).toEqual([]);
  });
});
