import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { captureError } from "@/lib/errors/capture";

export interface AuditLogEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Every settings mutation calls this after the mutation succeeds.
 *
 * Deliberately does NOT chain `.select()` — a caller who only holds
 * `audit.read` at no scope (or not at all) can still insert a row (the
 * audit_log_insert policy is `with check (true)` for every authenticated
 * user), but a returned/selected row is checked against the SELECT policy
 * too, so `.insert(...).select()` fails RLS for exactly the people who are
 * supposed to be able to write audit rows without being able to read them
 * back. Confirmed against a real Postgres instance in Session 1.
 *
 * Not run in the same transaction as the mutation it's logging — Supabase's
 * PostgREST client can't do that without an RPC wrapping both writes.
 * A failure here is logged, not thrown: the resource mutation the user
 * asked for has already succeeded, and failing the whole request because
 * the audit write failed would be a worse outcome than a rare gap in the
 * trail. A Postgres function combining both writes in one transaction
 * would close that gap; out of scope for the settings CRUD in this
 * session — see docs/DECISIONS.md.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: AuditLogEntry,
): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
  });

  if (error) {
    console.error(`audit log write failed for ${entry.action} on ${entry.entityType}`, error);

    // Security audit 2026-09-15, finding #7. Not throwing is still the
    // right call — the mutation the user asked for has already happened,
    // and failing their request afterwards would be a worse outcome than
    // a gap in the trail. What was wrong was that the gap was invisible:
    // non-negotiable #5 says every mutation writes to audit_log, and when
    // that silently stopped being true the only trace was a line in a
    // server log nobody reads.
    //
    // Now it reaches Settings → Platform Health and the alert email, like
    // every other failure. Deliberately fire-and-forget with its own
    // catch: the reporter must never turn a missing audit row into a
    // failed request either.
    //
    // The action and entity are recorded, never `before`/`after` — those
    // carry the record's own contents, and an error table is not a place
    // to copy PII into.
    void captureError({
      source: "audit",
      error: new Error(`audit log write failed: ${error.message}`),
      context: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        actorId: entry.actorId,
      },
    }).catch(() => {});
  }
}
