/**
 * Ordering for the spreadsheet-style table. Pure, so the rules can be tested
 * without a browser: numbers by value, text by natural order (so "Batch 2"
 * comes before "Batch 10"), empty cells last in either direction.
 */

export type SortValue = string | number | null | undefined;

export function isEmptySort(v: SortValue): boolean {
  return v === null || v === undefined || v === "" || v === "—";
}

export function compareSort(a: SortValue, b: SortValue, dir: "asc" | "desc"): number {
  const ea = isEmptySort(a);
  const eb = isEmptySort(b);
  if (ea && eb) return 0;
  // Empty cells sink to the bottom whichever way the column is sorted.
  if (ea) return 1;
  if (eb) return -1;
  const sign = dir === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" }) * sign;
}

export function sortRows<T>(rows: T[], pick: (row: T) => SortValue, dir: "asc" | "desc"): T[] {
  // A stable copy: equal rows keep the order the server gave them.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => compareSort(pick(x.row), pick(y.row), dir) || x.index - y.index)
    .map((x) => x.row);
}
