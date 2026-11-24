import { describe, expect, it } from "vitest";

import { leadCellText } from "../src/lib/leads/cell-text";
import { compareSort, sortRows } from "../src/lib/ui/sheet-sort";

describe("sorting the spreadsheet table", () => {
  it("orders text naturally, so Batch 2 comes before Batch 10", () => {
    expect(["Batch 10", "Batch 2", "Batch 1"].sort((a, b) => compareSort(a, b, "asc"))).toEqual(["Batch 1", "Batch 2", "Batch 10"]);
  });

  it("orders numbers by value, not as text", () => {
    expect([100, 9, 25].sort((a, b) => compareSort(a, b, "asc"))).toEqual([9, 25, 100]);
    expect([100, 9, 25].sort((a, b) => compareSort(a, b, "desc"))).toEqual([100, 25, 9]);
  });

  it("is not thrown by case or accents in names", () => {
    expect(["bala", "Asha", "chitra"].sort((a, b) => compareSort(a, b, "asc"))).toEqual(["Asha", "bala", "chitra"]);
  });

  it("puts empty cells last whichever way the column runs", () => {
    const rows = [{ v: "—" }, { v: "b" }, { v: null }, { v: "a" }, { v: "" }];
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v).slice(0, 2)).toEqual(["a", "b"]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v).slice(0, 2)).toEqual(["b", "a"]);
  });

  it("keeps equal rows in the order the server gave them", () => {
    const rows = [
      { id: 1, v: "x" },
      { id: 2, v: "x" },
      { id: 3, v: "x" },
    ];
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("does not change the rows it was given", () => {
    const rows = [{ v: 2 }, { v: 1 }];
    sortRows(rows, (r) => r.v, "asc");
    expect(rows.map((r) => r.v)).toEqual([2, 1]);
  });
});

describe("what a lead list cell copies", () => {
  const phone = { id: "p", key: "primary_phone", label: "Phone", type: "phone", isCore: true } as never;
  const name = { id: "n", key: "student_name", label: "Student", type: "text", isCore: true } as never;

  it("copies a phone number masked, exactly as the list shows it, never the full number", () => {
    const text = leadCellText(phone, { primary_phone: "+919847300123" }, {});
    expect(text).not.toContain("9847300123");
    expect(text).toContain("•");
    expect(text).toMatch(/3123$|••/);
  });

  it("copies plain values as they read", () => {
    expect(leadCellText(name, { student_name: "Asha K" }, {})).toBe("Asha K");
  });

  it("copies nothing worth keeping for an empty cell", () => {
    expect(leadCellText(name, { student_name: null }, {})).toBe("—");
    expect(leadCellText(phone, { primary_phone: null }, {})).toBe("—");
  });
});
