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

      <table className="sr-only">
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
    </figure>
  );
}
