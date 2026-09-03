import { A4_PORTRAIT_CSS } from "@/lib/print/page-css";
import { BADGE_KEYS, PRINT_ROWS, type SheetCells } from "@/lib/print/profile-sheet";

import { PrintButton } from "./print-button";

/**
 * AFD's paper student profile sheet, rendered.
 *
 * Presentational only — it takes already-formatted cells, so the same
 * markup serves the student record and a lead's submitted profile form
 * without either page's data shape leaking into the layout.
 */
export function ProfileSheet({
  orgName,
  logoUrl,
  name,
  photoUrl,
  cells,
  caption,
}: {
  orgName: string;
  logoUrl: string | null;
  name: string;
  photoUrl: string | null;
  cells: SheetCells;
  /** Small screen-only line above the sheet, e.g. when a form was submitted. */
  caption?: string;
}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: A4_PORTRAIT_CSS }} />
      <div className="relative mx-auto max-w-3xl p-8 print:p-0">
        {caption && <p className="text-sm text-muted-foreground print:hidden">{caption}</p>}
        <PrintButton />

        {/*
          Positioned outside the table's own column grid rather than as a
          rowSpan/colSpan cell inside it — a rowSpan cell would force every
          OTHER row in the table to also account for that extra column
          (either matching its width or leaving a visible gap), for a photo
          that only actually occupies the first two rows. Overlaying it is
          simpler and doesn't distort the rest of the table's 4-column grid.
        */}
        <div className="absolute right-8 top-24 print:right-0 print:top-20">
          <PhotoBox url={photoUrl} />
        </div>

        <table className="w-full border-collapse border border-foreground text-sm">
          <tbody>
            <tr>
              <td colSpan={4} className="border border-foreground p-3 text-center">
                <span className="text-lg font-bold">{orgName}</span>
                {logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- a print page has no image optimisation to gain from next/image
                  <img src={logoUrl} alt="" className="mx-auto mt-1 h-8 w-auto object-contain" />
                )}
              </td>
            </tr>

            <tr>
              <PrintLabel>Name</PrintLabel>
              <PrintValue colSpan={3}>{name}</PrintValue>
            </tr>

            {PRINT_ROWS.map(([leftKey, rightKey]) => {
              const left = cells[leftKey];
              const right = rightKey ? cells[rightKey] : undefined;
              return (
                <tr key={leftKey}>
                  <PrintLabel>{left?.label ?? leftKey}</PrintLabel>
                  <PrintValue badge={BADGE_KEYS.has(leftKey)}>{left?.display ?? "—"}</PrintValue>
                  <PrintLabel>{right?.label ?? rightKey}</PrintLabel>
                  <PrintValue badge={rightKey ? BADGE_KEYS.has(rightKey) : false}>
                    {right?.display ?? "—"}
                  </PrintValue>
                </tr>
              );
            })}

            <tr>
              <td colSpan={4} className="border border-foreground p-2 align-top">
                <p className="mb-1 font-semibold">{cells.comments?.label ?? "Comments"}:</p>
                {/* An em dash would look like an answer on a blank the
                    student is meant to have filled in, so an unanswered
                    comments box prints empty. */}
                <p className="min-h-16">
                  {cells.comments && cells.comments.display !== "—" ? cells.comments.display : ""}
                </p>
              </td>
            </tr>

            <tr>
              <td colSpan={2} className="border border-foreground p-2">
                &nbsp;
              </td>
              <td colSpan={2} className="border border-foreground p-2 text-right font-semibold">
                Signature:
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function PrintLabel({ children }: { children: React.ReactNode }) {
  return <td className="w-1/6 border border-foreground bg-muted p-2 font-semibold">{children}</td>;
}

function PrintValue({
  children,
  colSpan,
  badge,
}: {
  children: React.ReactNode;
  colSpan?: number;
  badge?: boolean;
}) {
  return (
    <td className="border border-foreground p-2" colSpan={colSpan}>
      {badge ? <span className="inline-block rounded bg-muted px-2 py-0.5">{children}</span> : children}
    </td>
  );
}

function PhotoBox({ url }: { url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- a print page has no image optimisation to gain from next/image
    return <img src={url} alt="" className="h-24 w-20 object-cover" />;
  }
  return <div className="h-24 w-20 border border-dashed border-muted-foreground" />;
}
