import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { dropdownOptions } from "@/lib/db/schema";

/**
 * The active values of one dropdown category, read on the direct
 * connection.
 *
 * There is already `getDropdownOptions()` for UI, but it takes an
 * RLS-bound Supabase client and returns value/label pairs for a picker.
 * This is for code paths with no session at all — the WhatsApp webhook,
 * a cron — that need the plain list of values a rule is evaluated
 * against. `dropdown_options` is world-readable configuration either way
 * (migration 0001), so nothing is being bypassed.
 */
export async function activeDropdownValues(category: string): Promise<string[]> {
  const rows = await db
    .select({ value: dropdownOptions.value })
    .from(dropdownOptions)
    .where(
      and(
        eq(dropdownOptions.category, category),
        eq(dropdownOptions.isActive, true),
        isNull(dropdownOptions.deletedAt),
      ),
    )
    .orderBy(dropdownOptions.sortOrder);
  return rows.map((row) => row.value);
}
