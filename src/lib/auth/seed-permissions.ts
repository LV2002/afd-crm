import type { DbExecutor } from "@/lib/db/client";
import { permissions } from "@/lib/db/schema";

import { PERMISSIONS } from "./permissions";

/**
 * Upserts the fixed permission primitives from the PERMISSIONS constant.
 * Idempotent — safe to call every time.
 *
 * Shared by `seed.ts` (the AFD India demo bootstrap) and config import
 * (the plug-and-play/multi-company bootstrap): permissions are fixed in
 * code, not part of any company's configuration (CLAUDE.md's "Fixed in
 * code" list), so they're never part of an exported config bundle — but
 * `role_permissions` rows an import brings in still need a real
 * `permissions.code` row to reference. Takes a `DbExecutor` (not the
 * module-level `db`) so config import can run this inside its own
 * transaction rather than opening a second one.
 *
 * Deliberately no `import "server-only"` here (unlike most of
 * `src/lib/auth/`): both current callers are plain-Node CLI scripts
 * (`seed.ts`, `import-config-cli.ts`), never bundled by webpack, and
 * `server-only`'s package actually throws under plain `require()` — its
 * no-op behaviour only kicks in via webpack's browser-field swap. Add it
 * back if this ever gets a real Next.js-bundled caller.
 */
export async function ensurePermissionsSeeded(executor: DbExecutor): Promise<void> {
  for (const perm of PERMISSIONS) {
    await executor
      .insert(permissions)
      .values(perm)
      .onConflictDoUpdate({
        target: permissions.code,
        set: {
          label: perm.label,
          category: perm.category,
          description: perm.description,
        },
      });
  }
}
