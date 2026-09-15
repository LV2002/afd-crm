"use server";

import { can, getCurrentUser } from "@/lib/auth/session";
import { maskPhone } from "@/lib/leads/mask-phone";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { createClient } from "@/lib/supabase/server";

/**
 * Finding one existing person, to point another record at them.
 *
 * Built for the referral picker — "who told them about us?" — and for the
 * `lead_ref` field type generally, which has been in the field schema
 * since the beginning with no way to fill it in.
 *
 * ## Why a search rather than a dropdown
 *
 * Every other reference field in this system loads its options up front.
 * That works for centres and counsellors and would be absurd here: at 200
 * leads a month the list is thousands long within a year, and it holds
 * phone numbers. Searching returns a handful of matches instead.
 *
 * ## Numbers stay masked
 *
 * CLAUDE.md § 6 — a counsellor never sees full phone numbers in bulk, and
 * a search box that returns them one query at a time is bulk with extra
 * steps. Enough of the number is shown to tell two people with the same
 * name apart, and no more. Reading it through the caller's own client
 * means RLS decides which leads are searchable at all.
 */

export interface LeadSearchResult {
  id: string;
  name: string;
  /** Masked. Never the full number. */
  phone: string;
  hint: string;
}

const MAX_RESULTS = 8;

export async function searchLeads(query: string): Promise<LeadSearchResult[]> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return [];

  const term = query.trim();
  // Two characters is the point where the result set stops being "most of
  // the database" — below it a search is a table scan wearing a filter.
  if (term.length < 2) return [];

  const supabase = await createClient();

  // A phone search only makes sense against the stored E.164 form, so the
  // typed digits are normalised the same way a saved number was. Somebody
  // typing "98471" means the start of a number, not a name.
  const asPhone = normalizePhone(term);
  const digitsOnly = /^[\d+\s-]+$/.test(term);

  const filters = [`student_name.ilike.%${term.replace(/[%,]/g, "")}%`];
  if (digitsOnly) {
    const bare = term.replace(/\D/g, "");
    if (bare) filters.push(`primary_phone.ilike.%${bare}%`);
    if (asPhone) filters.push(`primary_phone.eq.${asPhone}`);
  }

  const { data } = await supabase
    .from("leads")
    .select("id, student_name, primary_phone, lead_number")
    .is("deleted_at", null)
    .or(filters.join(","))
    .order("created_at", { ascending: false })
    .limit(MAX_RESULTS)
    .returns<
      Array<{ id: string; student_name: string; primary_phone: string; lead_number: number }>
    >();

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.student_name,
    phone: maskPhone(row.primary_phone),
    hint: `${maskPhone(row.primary_phone)} · #${row.lead_number}`,
  }));
}

/** The label for an already-chosen lead, so an edit form can show a name rather than a uuid. */
export async function describeLead(leadId: string): Promise<LeadSearchResult | null> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, student_name, primary_phone, lead_number")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; student_name: string; primary_phone: string; lead_number: number }>();

  if (!data) return null;
  return {
    id: data.id,
    name: data.student_name,
    phone: maskPhone(data.primary_phone),
    hint: `${maskPhone(data.primary_phone)} · #${data.lead_number}`,
  };
}
