import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { dropdownOptions } from "@/lib/db/schema";

/**
 * Courses, as the rest of the system sees them.
 *
 * A course is still a `dropdown_options` row in the `course` category — which
 * is why Courses Interested, filters, reports and fee records keep working
 * unchanged — and its **mode** (online or hybrid) lives beside it in the row's
 * `metadata`. A batch under the course takes its mode from here, so nobody
 * picks a mode twice.
 */
export const COURSE_MODE_KEY = "mode";

/** course value -> mode value, for every live course that has one. */
export async function courseModes(): Promise<Map<string, string>> {
  const rows = await db
    .select({ value: dropdownOptions.value, metadata: dropdownOptions.metadata })
    .from(dropdownOptions)
    .where(and(eq(dropdownOptions.category, "course"), isNull(dropdownOptions.deletedAt)));

  const modes = new Map<string, string>();
  for (const row of rows) {
    const mode = row.metadata?.[COURSE_MODE_KEY];
    if (typeof mode === "string" && mode) modes.set(row.value, mode);
  }
  return modes;
}

/** One course's mode, or null when it has none recorded. */
export async function courseModeOf(course: string): Promise<string | null> {
  return (await courseModes()).get(course) ?? null;
}

export interface CourseChoice {
  value: string;
  label: string;
  mode: string;
}

/** Live courses with a mode, in the order an admin arranged them. */
export async function courseChoices(): Promise<CourseChoice[]> {
  const rows = await db
    .select({
      value: dropdownOptions.value,
      label: dropdownOptions.label,
      metadata: dropdownOptions.metadata,
    })
    .from(dropdownOptions)
    .where(
      and(
        eq(dropdownOptions.category, "course"),
        eq(dropdownOptions.isActive, true),
        isNull(dropdownOptions.deletedAt),
      ),
    )
    .orderBy(asc(dropdownOptions.sortOrder), asc(dropdownOptions.label));

  return rows.map((row) => {
    const mode = row.metadata?.[COURSE_MODE_KEY];
    return { value: row.value, label: row.label, mode: typeof mode === "string" ? mode : "" };
  });
}
