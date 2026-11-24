"use client";

import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { sortRows, type SortValue } from "@/lib/ui/sheet-sort";
import { cn } from "@/lib/utils";

/**
 * A spreadsheet-style table for wide, data-heavy lists.
 *
 * - The header stays put while the body scrolls, and so do the first two
 *   columns (the "Open" button and the row's name) while the rest scroll
 *   sideways, so you never lose which row you are reading.
 * - Cells never wrap: long text is cut with an ellipsis and the whole value
 *   is in the tooltip, so every row is one line and the list stays scannable.
 * - Clicking a cell copies its text. Clicking a link or a button inside a
 *   cell does what that link or button does instead.
 * - Headers sort the rows on the page.
 *
 * The server hands over finished cells (`node` to show, `text` to copy), not
 * functions, because a server component cannot pass a function to a client
 * one. What a cell copies is decided where the data is, so a masked phone
 * number is masked in the copied text as well.
 */

export interface SheetColumn {
  key: string;
  header: string;
  sortable?: boolean;
}

export interface SheetCell {
  node: React.ReactNode;
  /** What clicking the cell copies, and what the tooltip shows. */
  text: string;
  /** What the column sorts by, when that differs from the text (a date, a number). */
  sort?: SortValue;
}

export interface SheetRow {
  id: string;
  /** Where the "Open" button goes. */
  href: string;
  cells: Record<string, SheetCell>;
}

export function SheetTable({
  columns,
  rows,
  openLabel = "Open",
  empty,
  className,
}: {
  columns: SheetColumn[];
  rows: SheetRow[];
  openLabel?: string;
  empty?: React.ReactNode;
  className?: string;
}) {
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const shown = React.useMemo(
    () => (sort ? sortRows(rows, (r) => r.cells[sort.key]?.sort ?? r.cells[sort.key]?.text, sort.dir) : rows),
    [rows, sort],
  );

  const toggle = (key: string) =>
    setSort((cur) => (cur?.key === key ? (cur.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  const copy = async (event: React.MouseEvent, text: string) => {
    // A link or button inside the cell keeps its own meaning.
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
    if (!text || text === "—") return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied", { description: text.length > 60 ? `${text.slice(0, 60)}…` : text });
    } catch {
      toast.error("Could not copy. Select the text and copy it instead.");
    }
  };

  return (
    <div className={cn("sheet-wrap", className)}>
      <table className="sheet">
        <thead>
          <tr>
            <th className="sheet-open" aria-label="Open" />
            {columns.map((col) => {
              const active = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(col.sortable !== false && "sheet-sortable")}
                  onClick={col.sortable === false ? undefined : () => toggle(col.key)}
                >
                  {col.header}
                  {active && <span aria-hidden="true"> {sort.dir === "asc" ? "▲" : "▼"}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.id}>
              <td className="sheet-open">
                <Link href={row.href} className="sheet-open-btn">
                  {openLabel}
                </Link>
              </td>
              {columns.map((col) => {
                const cell = row.cells[col.key];
                return (
                  <td key={col.key} className="sheet-cell" title={cell?.text ? `${cell.text} — click to copy` : undefined} onClick={(e) => copy(e, cell?.text ?? "")}>
                    {cell?.node}
                  </td>
                );
              })}
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="sheet-empty">
                {empty ?? "Nothing to show."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
