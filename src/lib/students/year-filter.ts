import { batchCoversYear, formatAcademicYear, startYearOf } from "@/lib/enrolment/academic-year";

/**
 * The PostgREST `or` clauses that select the students of an academic year.
 *
 * A student belongs to a year when they sit in a batch that covers it — a
 * two-year batch from 2026-27 covers 2027-28 as well. Somebody with no batch
 * yet is placed by the year they joined and their course's programme length.
 */
export function studentYearClauses(input: {
  year: string;
  batches: ReadonlyArray<{ id: string; academic_year: string; years: number }>;
  /** course value -> programme length in years */
  durations: ReadonlyMap<string, number>;
}): string[] {
  const { year, batches, durations } = input;
  const clauses: string[] = [`and(current_batch_id.is.null,intake_year.eq.${year})`];
  const ids = batches.filter((b) => batchCoversYear(b.academic_year, b.years, year)).map((b) => b.id);
  if (ids.length > 0) clauses.push(`current_batch_id.in.(${ids.join(",")})`);
  const startYear = startYearOf(year);
  if (Number.isFinite(startYear)) {
    for (let back = 1; back <= 4; back += 1) {
      const joinedIn = formatAcademicYear(startYear - back);
      const courses = [...durations].filter(([code, years]) => years > back && /^[a-z0-9_-]+$/i.test(code)).map(([code]) => code);
      if (courses.length > 0) clauses.push(`and(current_batch_id.is.null,intake_year.eq.${joinedIn},current_course.in.(${courses.join(",")}))`);
    }
  }
  return clauses;
}
