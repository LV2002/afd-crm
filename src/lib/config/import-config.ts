import { db } from "@/lib/db/client";
import { ensurePermissionsSeeded } from "@/lib/auth/seed-permissions";
import {
  businessHours,
  centers,
  dropdownCategories,
  dropdownOptions,
  fieldDefinitions,
  holidays,
  orgSettings,
  pipelineStages,
  roles,
  rolePermissions,
  slaPolicies,
  temperatureRules,
  terminology,
} from "@/lib/db/schema";

import type { ConfigBundle } from "./bundle-schema";

export interface ImportConfigResult {
  error?: string;
  counts?: Record<string, number>;
}

const GUARD_TABLES = [
  { name: "org_settings", table: orgSettings },
  { name: "terminology", table: terminology },
  { name: "centers", table: centers },
  { name: "dropdown_categories", table: dropdownCategories },
  { name: "dropdown_options", table: dropdownOptions },
  { name: "pipeline_stages", table: pipelineStages },
  { name: "field_definitions", table: fieldDefinitions },
  { name: "roles", table: roles },
  { name: "role_permissions", table: rolePermissions },
  { name: "temperature_rules", table: temperatureRules },
  { name: "sla_policies", table: slaPolicies },
  { name: "business_hours", table: businessHours },
  { name: "holidays", table: holidays },
] as const;

/**
 * Imports a validated config bundle (CLAUDE.md § Plug-and-play test).
 * Called only from the `db:config-import` CLI script
 * (`src/lib/db/import-config-cli.ts`), never from a web Server Action —
 * see docs/DECISIONS.md for why: an already-logged-in admin's own
 * `profiles` row always references the very `roles` row this would need
 * to replace first (`profiles.role_id` is `onDelete: restrict`), so
 * there's no authenticated web caller this could ever work for without
 * either that paradox or real conflict-resolution/reassignment logic
 * this session doesn't attempt. Same trust model as `npm run db:seed`:
 * whoever has shell access to run it is trusted, no permission check.
 *
 * No `import "server-only"` here either, for the same reason as
 * `seed-permissions.ts`: its one caller is a plain-Node CLI script, and
 * that package throws under plain `require()`, not just under webpack.
 *
 * Runs on the direct db client, in one transaction — same trust boundary
 * as `resolveOrCreateLead()`/CSV import, and for the same structural
 * reason `role_permissions` needs it: `permissions` has no INSERT/UPDATE
 * RLS policy for any authenticated role at all (see docs/DECISIONS.md).
 *
 * Refuses to run unless every table it would touch is already empty —
 * "Import into an empty instance" (CLAUDE.md) is read literally here, on
 * purpose: this tool bootstraps a fresh instance's configuration, not a
 * merge onto one that's already diverged (real business data referencing
 * the target's own existing centres/stages/roles by id would be left
 * pointing at the wrong things, or the import would collide on a unique
 * constraint like `roles.code`). Pushing a config change onto an
 * already-configured, already-live instance is real, harder work
 * (conflict resolution, re-pointing existing references) this session
 * deliberately doesn't attempt — see docs/DECISIONS.md.
 */
export async function importConfig(bundle: ConfigBundle): Promise<ImportConfigResult> {
  return db.transaction(async (tx) => {
    for (const { name, table } of GUARD_TABLES) {
      const existing = await tx.select().from(table).limit(1);
      if (existing.length > 0) {
        return {
          error: `This instance already has ${name.replace(/_/g, " ")} configured. Config import only runs on a freshly-migrated, empty instance.`,
        };
      }
    }

    // Fixed in code, not part of the bundle — see bundle-schema.ts. Must
    // exist before role_permissions can reference a permission_code.
    await ensurePermissionsSeeded(tx);

    if (bundle.orgSettings.length > 0) await tx.insert(orgSettings).values(bundle.orgSettings);
    if (bundle.terminology.length > 0) await tx.insert(terminology).values(bundle.terminology);
    if (bundle.centers.length > 0) await tx.insert(centers).values(bundle.centers);
    if (bundle.dropdownCategories.length > 0) await tx.insert(dropdownCategories).values(bundle.dropdownCategories);
    if (bundle.dropdownOptions.length > 0) await tx.insert(dropdownOptions).values(bundle.dropdownOptions);
    if (bundle.pipelineStages.length > 0) await tx.insert(pipelineStages).values(bundle.pipelineStages);
    if (bundle.roles.length > 0) await tx.insert(roles).values(bundle.roles);
    if (bundle.rolePermissions.length > 0) await tx.insert(rolePermissions).values(bundle.rolePermissions);
    if (bundle.fieldDefinitions.length > 0) await tx.insert(fieldDefinitions).values(bundle.fieldDefinitions);
    if (bundle.temperatureRules.length > 0) await tx.insert(temperatureRules).values(bundle.temperatureRules);
    if (bundle.slaPolicies.length > 0) await tx.insert(slaPolicies).values(bundle.slaPolicies);
    if (bundle.businessHours.length > 0) await tx.insert(businessHours).values(bundle.businessHours);
    if (bundle.holidays.length > 0) await tx.insert(holidays).values(bundle.holidays);

    return {
      counts: {
        orgSettings: bundle.orgSettings.length,
        terminology: bundle.terminology.length,
        centers: bundle.centers.length,
        dropdownCategories: bundle.dropdownCategories.length,
        dropdownOptions: bundle.dropdownOptions.length,
        pipelineStages: bundle.pipelineStages.length,
        fieldDefinitions: bundle.fieldDefinitions.length,
        roles: bundle.roles.length,
        rolePermissions: bundle.rolePermissions.length,
        temperatureRules: bundle.temperatureRules.length,
        slaPolicies: bundle.slaPolicies.length,
        businessHours: bundle.businessHours.length,
        holidays: bundle.holidays.length,
      },
    };
  });
}
