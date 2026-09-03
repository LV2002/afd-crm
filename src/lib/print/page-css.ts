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

/** Portrait A4 — forms that read as a single column down the page. */
export const A4_PORTRAIT_CSS = `
  @page { size: A4 portrait; margin: 12mm; }
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
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;
