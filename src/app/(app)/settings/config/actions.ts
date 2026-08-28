"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { CONFIG_BUNDLE_VERSION } from "@/lib/config/bundle-schema";
import { exportConfig } from "@/lib/config/export-config";
import { db } from "@/lib/db/client";
import { configSnapshots } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export interface ExportResult {
  error?: string;
  bundleJson?: string;
}

/**
 * Web-based export only — see docs/DECISIONS.md for why import is a CLI
 * tool (`npm run db:config-import`) instead of a matching web action: an
 * already-logged-in admin's own `profiles` row always references the very
 * `roles` row a "replace configuration" import would need to remove
 * first (`profiles.role_id` is `onDelete: restrict`), so there is no
 * already-authenticated caller an import button could ever work for
 * without either the paradox or building real conflict-resolution/
 * reassignment logic this session deliberately doesn't attempt.
 */
export async function exportConfigAction(): Promise<ExportResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "config.export")) {
    return { error: "You don't have permission to export configuration." };
  }

  const bundle = await exportConfig();
  const bundleJson = JSON.stringify(bundle, null, 2);

  await db.insert(configSnapshots).values({
    name: `Export ${new Date().toISOString()}`,
    kind: "export",
    version: CONFIG_BUNDLE_VERSION,
    payload: bundle,
    createdBy: user.id,
  });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "config.export",
    entityType: "config_snapshots",
    after: { tableCount: Object.keys(bundle).length },
  });

  revalidatePath("/settings/config");
  return { bundleJson };
}
