export const TERMINOLOGY_KEYS = [
  "lead",
  "student",
  "counsellor",
  "center",
  "course",
  "exam",
] as const;
export type TerminologyKey = (typeof TERMINOLOGY_KEYS)[number];

export type TermForm = "singular" | "plural";

export interface TermPair {
  singular: string;
  plural: string;
}

export type TerminologyMap = Record<TerminologyKey, TermPair>;

/** Used when a row is missing, inactive, or the terminology table can't be reached. */
export const DEFAULT_TERMINOLOGY: TerminologyMap = {
  lead: { singular: "Lead", plural: "Leads" },
  student: { singular: "Student", plural: "Students" },
  counsellor: { singular: "Counsellor", plural: "Counsellors" },
  center: { singular: "Centre", plural: "Centres" },
  course: { singular: "Course", plural: "Courses" },
  exam: { singular: "Exam", plural: "Exams" },
};

/**
 * Every user-facing entity label in the app should route through this
 * instead of a hardcoded string, so a different company's vocabulary is a
 * data change (the terminology table), never a code change.
 */
export function formatTerm(
  map: TerminologyMap,
  key: TerminologyKey,
  form: TermForm = "singular",
): string {
  return map[key]?.[form] ?? DEFAULT_TERMINOLOGY[key][form];
}
