import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { dropdownOptions, fieldDefinitions } from "@/lib/db/schema";
import { CORE_KEY_TO_DROPDOWN_CATEGORY } from "@/lib/fields/core-dropdown-categories";
import type { FieldEntity, FieldType } from "@/lib/fields/get-field-schema";
import type { MappableField } from "@/lib/integrations/meta/map-custom-answers";

/**
 * The field catalogue as an *unattended* ingestion path needs it: every
 * active field for an entity, with its option list already resolved.
 *
 * Separate from `getFieldSchema()` + `resolveFieldOptions()` rather than
 * reusing them, for one reason that matters: those two take a
 * `SupabaseClient` and a `SessionUser`, because the UI's answer to "which
 * fields are there" depends on who is asking (`visible_to_roles`). A
 * webhook has no user. Role-visibility is a display rule, not a storage
 * rule — a field hidden from counsellors is still a field, and an ad form
 * answering it should still be recorded — so this deliberately ignores it
 * and runs on the direct db client, the same trust boundary
 * `resolveOrCreateLead()` itself runs on (CLAUDE.md non-negotiable #3:
 * service-role in webhooks and cron only).
 *
 * Which fields an ingestion path may then *write* is a separate question,
 * answered by `isIngestableField()` — see lib/leads/ingest-protected-fields.ts.
 */
export async function ingestFieldCatalog(entity: FieldEntity): Promise<MappableField[]> {
  const rows = await db
    .select({
      key: fieldDefinitions.key,
      label: fieldDefinitions.label,
      type: fieldDefinitions.type,
      isCore: fieldDefinitions.isCore,
      options: fieldDefinitions.options,
    })
    .from(fieldDefinitions)
    .where(
      and(
        eq(fieldDefinitions.entity, entity),
        eq(fieldDefinitions.isActive, true),
        isNull(fieldDefinitions.deletedAt),
      ),
    )
    .orderBy(asc(fieldDefinitions.sortOrder));

  const categories = Array.from(
    new Set(
      rows
        .map((row) => CORE_KEY_TO_DROPDOWN_CATEGORY[row.key])
        .filter((category): category is string => Boolean(category)),
    ),
  );

  // One query for every category at once: a form with three dropdown
  // questions should not cost three round trips inside a webhook that
  // Meta will retry if it takes too long.
  const optionRows = categories.length
    ? await db
        .select({
          category: dropdownOptions.category,
          value: dropdownOptions.value,
          label: dropdownOptions.label,
        })
        .from(dropdownOptions)
        .where(
          and(
            inArray(dropdownOptions.category, categories),
            eq(dropdownOptions.isActive, true),
            isNull(dropdownOptions.deletedAt),
          ),
        )
        .orderBy(asc(dropdownOptions.sortOrder))
    : [];

  const byCategory = new Map<string, Array<{ value: string; label: string }>>();
  for (const row of optionRows) {
    const list = byCategory.get(row.category) ?? [];
    list.push({ value: row.value, label: row.label });
    byCategory.set(row.category, list);
  }

  return rows.map((row) => {
    const category = CORE_KEY_TO_DROPDOWN_CATEGORY[row.key];
    return {
      key: row.key,
      label: row.label,
      type: row.type as FieldType,
      isCore: row.isCore,
      // A core field's options come from its dropdown category; a custom
      // field's from its own definition. Anything else has no list, and
      // an empty list means "no vocabulary to match against", which the
      // mapper handles by keeping the answer as given.
      options: category ? (byCategory.get(category) ?? []) : (row.options ?? []),
    };
  });
}
