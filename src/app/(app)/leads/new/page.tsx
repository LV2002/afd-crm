import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { getDropdownOptions } from "@/lib/fields/resolve-field-options";
import { createClient } from "@/lib/supabase/server";
import { formatTerm } from "@/lib/terminology/terms";
import { getTerminologyMap } from "@/lib/terminology/get-terminology";

import { LeadCreateForm } from "./lead-create-form";

export default async function NewLeadPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.create")) return <AccessDenied />;

  const terms = await getTerminologyMap();
  const leadSingular = formatTerm(terms, "lead", "singular");

  const supabase = await createClient();
  const [examOptions, courseOptions, sourceOptions, centerRows] = await Promise.all([
    getDropdownOptions(supabase, "exam"),
    getDropdownOptions(supabase, "course"),
    getDropdownOptions(supabase, "lead_source"),
    supabase
      .from("centers")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .returns<Array<{ id: string; name: string }>>(),
  ]);

  // The Country field's own options, when the field exists and is switched on.
  // A custom field keeps its options on its definition, so an admin edits them
  // in Settings → Custom Fields; no field, or switched off, means no picker.
  const { data: countryField } = await supabase
    .from("field_definitions")
    .select("options")
    .eq("entity", "lead")
    .eq("key", "country")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle<{ options: Array<{ value: string; label: string }> | null }>();
  const countryOptions = countryField?.options ?? null;

  const scope = scopeFor(user, "lead.create");
  const centers = (centerRows.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">New {leadSingular}</h1>
        <p className="text-sm text-muted-foreground">
          Assignment is automatic and the lead starts as Not contacted, same as any other lead source.
        </p>
      </div>
      <LeadCreateForm
        centers={centers}
        examOptions={examOptions}
        courseOptions={courseOptions}
        sourceOptions={sourceOptions}
        countryOptions={countryOptions}
        showCenterPicker={scope !== "own"}
      />
    </div>
  );
}
