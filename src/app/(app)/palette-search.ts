"use server";

import { can, getCurrentUser } from "@/lib/auth/session";
import { filterTerm } from "@/lib/db/filter-term";
import { maskPhone } from "@/lib/leads/mask-phone";
import { createClient } from "@/lib/supabase/server";

/**
 * What the ⌘K palette finds.
 *
 * Reads through the RLS-bound client like every other query, so a
 * counsellor searching "Aleena" finds their own Aleena and nobody else's
 * — the palette is a faster way to reach what somebody can already see,
 * never a way around the scope.
 *
 * **Phones come back masked.** CLAUDE.md non-negotiable #6 is about bulk
 * exposure, and a search box that returns twenty full numbers per
 * keystroke is the most efficient bulk export ever built. The masked form
 * is enough to tell two people with the same name apart, which is all
 * this needs to do; the full number is on the lead's own page, where
 * revealing it is recorded.
 */

export interface PaletteHit {
  id: string;
  name: string;
  /** Masked, always. */
  phone: string;
  kind: "lead" | "student";
}

export async function searchForPalette(term: string): Promise<PaletteHit[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const needle = filterTerm(term);
  if (!needle || needle.length < 2) return [];

  const supabase = await createClient();
  const hits: PaletteHit[] = [];

  if (can(user, "lead.read")) {
    const { data } = await supabase
      .from("leads")
      .select("id, student_name, primary_phone")
      .is("deleted_at", null)
      .or(`student_name.ilike.%${needle}%,primary_phone.ilike.%${needle}%`)
      .order("created_at", { ascending: false })
      .limit(6)
      .returns<Array<{ id: string; student_name: string; primary_phone: string | null }>>();

    for (const row of data ?? []) {
      hits.push({
        id: row.id,
        name: row.student_name,
        phone: maskPhone(row.primary_phone),
        kind: "lead",
      });
    }
  }

  if (can(user, "student.read")) {
    const { data } = await supabase
      .from("students")
      .select("id, full_name, phone")
      .is("deleted_at", null)
      .or(`full_name.ilike.%${needle}%,phone.ilike.%${needle}%`)
      .limit(4)
      .returns<Array<{ id: string; full_name: string; phone: string | null }>>();

    for (const row of data ?? []) {
      hits.push({ id: row.id, name: row.full_name, phone: maskPhone(row.phone), kind: "student" });
    }
  }

  return hits;
}
