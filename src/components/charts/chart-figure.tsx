import type { ReactNode } from "react";

/**
 * The frame every chart in this CRM sits in.
 *
 * Three things, always in the same order: a caption that names what is
 * being drawn, the chart, and the same numbers as a table only a screen
 * reader sees. The table is not optional politeness — a chart that exists
 * only as pixels cannot be read by somebody using a screen reader, and
 * cannot be quoted by anybody who wants the figure rather than the shape.
 *
 * It is also the relief the palette needs. Three of the six series
 * colours fall below 3:1 on a white background; the validator permits
 * them only where identity is carried by something besides colour, and a
 * legend plus this table is that something.
 */
export function ChartFigure({
  title,
  note,
  columns,
  rows,
  children,
}: {
  title: string;
  /** A short clause after the title — a total, a date range, a caveat. */
  note?: string;
  /** Column headings for the screen-reader table. The first is the row label. */
  columns: string[];
  /** Each row: the label first, then one cell per remaining column. */
  rows: Array<Array<string | number>>;
  children: ReactNode;
}) {
  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="text-sm font-medium">
        {title}
        {note ? <span className="font-normal text-muted-foreground"> · {note}</span> : null}
      </figcaption>

      {children}

      {/*
        `sr-only` goes on a WRAPPER, never on the <table> itself.

        This was the 173px of sideways scroll on /dashboard at phone width,
        and it is a nasty one. `sr-only` is `width: 1px; overflow: hidden;
        white-space: nowrap`, which works on anything that can be 1px wide
        — and a table cannot: a table box will not shrink below its minimum
        content width, so with `nowrap` holding the caption on one line the
        box came out 746px wide. `overflow: hidden` then clips the table's
        CONTENTS and not the table box, and because `sr-only` is also
        `position: absolute`, that 746px box reports straight into the
        document's scrollable width. A table nobody can see was dragging
        every page sideways on a phone.

        A <div> does honour `width: 1px`, so the clipping happens one level
        up and nothing escapes. Measured against the built CSS at 412px:
        374px of page overflow with the class on the table, 0 with it on a
        wrapper. The table is unchanged and still reads out the same way.

        It surfaced when the caption grew — a longer sentence is a wider
        nowrap box — which is why it looked like it arrived with an
        unrelated change.
      */}
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])}>
                <th scope="row">{row[0]}</th>
                {row.slice(1).map((cell, index) => (
                  <td key={columns[index + 1] ?? index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
