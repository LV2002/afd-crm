/**
 * The one spelling of an academic year.
 *
 * `fee_structures` is looked up by an EXACT match on course, centre, mode
 * and academic year. So the string has to be identical in the two places
 * it is produced — the admission form that reads it, and the Settings
 * screen that writes it — or the lookup silently finds nothing.
 *
 * It did. The admission form offered a fixed list (`2026-27`); the fee
 * structure form was a free text box with `2026-27` as a placeholder.
 * Leon typed `2027`, which is a perfectly reasonable thing to type, and
 * every admission for that course failed with "no fee structure" while a
 * fee structure sat right there on screen. Two ways to write one value,
 * one of them unconstrained, joined on equality.
 *
 * `2026-27`, `2026-2027`, `2026/27` and `26-27` are all the same year to a
 * person and four different rows to Postgres.
 */

/** An academic year is named for the calendar year it starts in. */
export function formatAcademicYear(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * The year an admission taken `now` most likely belongs to.
 *
 * April, because enrolment for the next academic year begins well before
 * the year itself does — a counsellor confirming in February is working
 * on the year that is ending, not the one that starts in June.
 */
export function currentAcademicStartYear(now: Date = new Date()): number {
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

export interface AcademicYearOption {
  value: string;
  label: string;
}

/**
 * Last year, this year and the two ahead — the window a counsellor or an
 * admin ever needs, short enough to pick from without scrolling.
 *
 * `include` adds a value that is already stored but outside the window, so
 * editing an old row (or one somebody typed by hand before this was a
 * list) shows what it actually says instead of silently rewriting it to
 * something else. It is marked, because an odd one is usually a mistake
 * worth noticing.
 */
export function academicYearOptions(
  include?: string | null,
  now: Date = new Date(),
): AcademicYearOption[] {
  const startYear = currentAcademicStartYear(now);
  const options: AcademicYearOption[] = [];
  for (let year = startYear - 1; year <= startYear + 2; year += 1) {
    const label = formatAcademicYear(year);
    options.push({ value: label, label });
  }

  if (include && !options.some((option) => option.value === include)) {
    options.unshift({ value: include, label: `${include} (as stored)` });
  }

  return options;
}
