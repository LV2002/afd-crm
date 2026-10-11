import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface LeadDetailRow {
  id: string;
  lead_number: number;
  student_name: string;
  primary_phone: string;
  center_id: string | null;
  assigned_to: string | null;
  custom: Record<string, unknown> | null;
  profile_form_token: string | null;
  profile_form_submitted_at: string | null;
  /** Null on a submitted form means nobody has read it yet — see migration 0076. */
  profile_form_reviewed_at: string | null;
  profile_form_data: Record<string, unknown> | null;
  [column: string]: unknown;
}

/**
 * A single lead row plus the human labels for its FK-ish core fields
 * (centre, assigned counsellor) — resolved with two cheap lookups
 * rather than a Supabase embedded-relation select, so the row shape stays
 * a flat `Record<string, unknown>` that getRawFieldValue()/formatFieldValue()
 * already know how to read (same convention as the list page).
 */
export interface LeadDetail {
  row: LeadDetailRow;
  centerName: string | null;
  assignedToName: string | null;
}

export async function getLeadDetail(supabase: SupabaseClient, leadId: string): Promise<LeadDetail | null> {
  const { data: row } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle<LeadDetailRow>();

  if (!row) return null;

  const [center, assignee] = await Promise.all([
    row.center_id
      ? supabase.from("centers").select("name").eq("id", row.center_id).maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null }),
    row.assigned_to
      ? supabase
          .from("profiles")
          .select("full_name")
          .eq("id", row.assigned_to)
          .maybeSingle<{ full_name: string }>()
      : Promise.resolve({ data: null }),
  ]);

  return {
    row,
    centerName: center.data?.name ?? null,
    assignedToName: assignee.data?.full_name ?? null,
  };
}
