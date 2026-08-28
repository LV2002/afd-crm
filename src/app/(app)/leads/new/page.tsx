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
  const [examOptions, courseOptions, centerRows] = await Promise.all([
    getDropdownOptions(supabase, "exam"),
    getDropdownOptions(supabase, "course"),
    supabase
      .from("centers")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .returns<Array<{ id: string; name: string }>>(),
  ]);

  const scope = scopeFor(user, "lead.create");
  const centers = (centerRows.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">New {leadSingular}</h1>
        <p className="text-sm text-muted-foreground">
          Assignment and stage are set automatically, same as any other lead source.
        </p>
      </div>
      <LeadCreateForm
        centers={centers}
        examOptions={examOptions}
        courseOptions={courseOptions}
        showCenterPicker={scope !== "own"}
      />
    </div>
  );
}
