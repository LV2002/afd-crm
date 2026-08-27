import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * Per CLAUDE.md non-negotiable #3: use this ONLY in webhook handlers and
 * cron jobs (route handlers under /api/webhooks/* and /api/cron/*) and in
 * server-only scripts (seed, migrations) — never in a route reachable
 * directly by a browser session, never in a Server Action a user triggers,
 * never in a client component. The `server-only` import above turns an
 * accidental client-side import into a build failure; it does not stop a
 * misused Server Action, so review call sites by hand.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set to use the service-role client",
    );
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
