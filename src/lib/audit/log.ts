import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
  }
}
