import "server-only";

import { isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  businessHours,
  centers,
  dropdownCategories,
  dropdownOptions,
  feeStructures,
  fieldDefinitions,
  holidays,
  orgSettings,
  pipelineStages,
  roles,
  rolePermissions,
  slaPolicies,
  tags,
  temperatureRules,
  terminology,
} from "@/lib/db/schema";

import { CONFIG_BUNDLE_VERSION, type ConfigBundle } from "./bundle-schema";

/**
 * Dumps every configuration table to one bundle (CLAUDE.md § Plug-and-play
 * test). Runs on the direct db client, same trust boundary as
 * `resolveOrCreateLead()`/CSV import — the caller (the Server Action)
 * checks `config.export` before this ever runs; this function itself
 * trusts that's already been done.
 *
 * Soft-deleted rows are excluded — a config export is "how this instance
 * is configured right now," not its history. Inactive-but-not-deleted
 * rows ARE included: an admin deliberately deactivating something without
 * deleting it is still part of the current configuration.
 */
export async function exportConfig(): Promise<ConfigBundle> {
  const [
    orgSettingsRows,
    terminologyRows,
    centerRows,
    dropdownCategoryRows,
    dropdownOptionRows,
    pipelineStageRows,
    fieldDefinitionRows,
    roleRows,
    rolePermissionRows,
    temperatureRuleRows,
    slaPolicyRows,
    businessHoursRows,
    holidayRows,
    feeStructureRows,
    tagRows,
  ] = await Promise.all([
    db.select().from(orgSettings),
    db.select().from(terminology),
    db.select().from(centers).where(isNull(centers.deletedAt)),
    db.select().from(dropdownCategories),
    db.select().from(dropdownOptions).where(isNull(dropdownOptions.deletedAt)),
    db.select().from(pipelineStages).where(isNull(pipelineStages.deletedAt)),
    db.select().from(fieldDefinitions).where(isNull(fieldDefinitions.deletedAt)),
    db.select().from(roles),
    db.select().from(rolePermissions),
    db.select().from(temperatureRules).where(isNull(temperatureRules.deletedAt)),
    db.select().from(slaPolicies).where(isNull(slaPolicies.deletedAt)),
    db.select().from(businessHours),
    db.select().from(holidays),
    db.select().from(feeStructures).where(isNull(feeStructures.deletedAt)),
    db.select().from(tags).where(isNull(tags.deletedAt)),
  ]);

  return {
    version: CONFIG_BUNDLE_VERSION,
    exportedAt: new Date(),
    orgSettings: orgSettingsRows,
    terminology: terminologyRows,
    centers: centerRows,
    dropdownCategories: dropdownCategoryRows,
    dropdownOptions: dropdownOptionRows,
    pipelineStages: pipelineStageRows,
    fieldDefinitions: fieldDefinitionRows,
    roles: roleRows,
    rolePermissions: rolePermissionRows,
    temperatureRules: temperatureRuleRows,
    slaPolicies: slaPolicyRows,
    businessHours: businessHoursRows,
    holidays: holidayRows,
    feeStructures: feeStructureRows,
    tags: tagRows,
  };
}
