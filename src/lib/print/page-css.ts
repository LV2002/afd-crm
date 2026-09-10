/**
 * Print stylesheets for the documents this CRM produces on paper.
 *
 * Everything prints on **A4**, deliberately and in one place: A4 is the
 * paper AFD's offices actually have, and every one of these documents is
 * printed to be signed by hand and scanned back in. A document that prints
 * at some other size comes back cropped or scaled by the scanner, and the
 * signed copy on file no longer matches the one that was issued.
 *
 * The `@page` rule is what actually decides the sheet; without it browsers
 * fall back to whatever the print dialog last used, which is how a form
 * silently comes out on Letter.
 */

/**
 * Every page in the app carries a print-only letterhead (see the `(app)`
 * layout) so that any screen — a report, a list — prints as the
 * institute's stationery rather than as a bare web page.
 *
 * A page that draws its OWN letterhead has to switch that one off, or the
 * document prints with two. Rather than each document remembering to do
 * it, the rule rides along with the stylesheet every document already
 * injects, so it is impossible to have one without the other.
 */
const SUPPRESS_GENERIC_LETTERHEAD = `
  .app-print-letterhead { display: none !important; }
`;

/** Portrait A4 — forms that read as a single column down the page. */
export const A4_PORTRAIT_CSS = `
  @page { size: A4 portrait; margin: 12mm; }
  ${SUPPRESS_GENERIC_LETTERHEAD}
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

/**
 * Landscape A4 — for the instalment agreement, whose two-column design
 * (details and schedule on the left, terms and signatures on the right)
 * needs the width. Its paper original is A5 landscape; printing the same
 * layout on A4 keeps the proportions and makes it markedly more legible,
 * which matters for a document someone signs.
 */
export const A4_LANDSCAPE_CSS = `
  @page { size: A4 landscape; margin: 10mm; }
  ${SUPPRESS_GENERIC_LETTERHEAD}
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

/**
 * The default for every other screen — the reports, the lists, anything
 * somebody presses Ctrl+P on.
 *
 * Lives in the app layout rather than on each page, because "which
 * reports are printable?" is a question nobody should have to answer: the
 * useful ones are whichever one somebody is looking at when a meeting
 * asks for it on paper.
 *
 * Applied at the top of the cascade so a document page's own `@page` rule,
 * injected further down the DOM, still wins.
 */
export const A4_SCREEN_CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* Charts, wide tables and filter bars are for reading on a screen.
       A table that scrolls sideways prints its first six columns and
       silently loses the rest, which is worse than not printing it. */
    .no-print { display: none !important; }
    [data-print="hide"] { display: none !important; }
    .overflow-x-auto { overflow: visible !important; }
    table { break-inside: auto; }
    tr { break-inside: avoid; break-after: auto; }
    thead { display: table-header-group; }
  }
`;
