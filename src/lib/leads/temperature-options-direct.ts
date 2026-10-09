import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { dropdownOptions } from "@/lib/db/schema";

import { sortTemperatures, toTemperatureOption, type TemperatureOption } from "./temperature-kinds";

/**
 * The direct-client twin of `loadTemperatureOptions` — for cron jobs,
 * webhooks and the ingestion path, which run outside any user's session.
 * See `temperature-options.ts` for why inactive options are included and
 * why the two live in separate files.
 */
export async function loadTemperatureOptionsDirect(): Promise<TemperatureOption[]> {
  const rows = await db
    .select({
      value: dropdownOptions.value,
      label: dropdownOptions.label,
      color: dropdownOptions.color,
      sort_order: dropdownOptions.sortOrder,
      is_active: dropdownOptions.isActive,
      metadata: dropdownOptions.metadata,
    })
    .from(dropdownOptions)
    .where(and(eq(dropdownOptions.category, "temperature"), isNull(dropdownOptions.deletedAt)));

  return sortTemperatures(rows.map(toTemperatureOption));
}
