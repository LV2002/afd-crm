import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeAuditAction, describeEntityType } from "@/lib/audit/describe-entry";

/**
 * The filter dropdowns, built from what is actually in the log.
 *
 * A hardcoded list of actions would need editing every time a call site
 * is added, and would offer filters that return nothing. This reads the
 * recent history instead, so the choices on offer are the choices that
 * exist.
 *
 * Bounded deliberately: at 200 leads a month this table grows by tens of
 * thousands of rows a year, and a `select distinct` over all of it on
 * every page load would be the slowest query in the application. The most
 * recent few thousand rows contain every action type the system has used
 * lately, which is what the filter is for.
 */

const FACET_SAMPLE = 3000;

export interface AuditFacets {
  actors: Array<{ value: string; label: string }>;
  subjects: Array<{ value: string; label: string }>;
  entityTypes: Array<{ value: string; label: string }>;
}

export async function loadAuditFacets(supabase: SupabaseClient): Promise<AuditFacets> {
  const [{ data: recent }, { data: people }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("action, entity_type")
      .order("occurred_at", { ascending: false })
      .limit(FACET_SAMPLE)
      .returns<Array<{ action: string; entity_type: string }>>(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name")
      .returns<Array<{ id: string; full_name: string }>>(),
  ]);

  const subjects = new Set<string>();
  const entityTypes = new Set<string>();
  for (const row of recent ?? []) {
    subjects.add(describeAuditAction(row.action).subject);
    entityTypes.add(row.entity_type);
  }

  return {
    // Everybody, not only those who appear in the sample: looking for what
    // one person did and finding their name missing reads as "they did
    // nothing", which is a different claim from "not in the last 3000
    // rows".
    actors: (people ?? []).map((person) => ({ value: person.id, label: person.full_name })),
    subjects: [...subjects]
      .sort()
      .map((subject) => ({ value: subject, label: describeEntityType(subject) })),
    entityTypes: [...entityTypes]
      .sort()
      .map((entityType) => ({ value: entityType, label: describeEntityType(entityType) })),
  };
}
