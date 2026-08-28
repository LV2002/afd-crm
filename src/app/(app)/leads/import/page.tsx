import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { importableFields } from "@/lib/leads/importable-fields";
import { createClient } from "@/lib/supabase/server";
import { formatTerm } from "@/lib/terminology/terms";
import { getTerminologyMap } from "@/lib/terminology/get-terminology";

import { ImportWizard } from "./import-wizard";

export default async function ImportLeadsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.import")) return <AccessDenied />;

  const terms = await getTerminologyMap();
  const leadPlural = formatTerm(terms, "lead", "plural");
  const scope = scopeFor(user, "lead.import");

  const supabase = await createClient();
  const fields = importableFields(await getFieldSchema(supabase, "lead", user));

  // Scoped to the importer's own centres, same restriction the Server
  // Action itself enforces — no point offering a centre the import would
  // just reject row by row.
  let centerQuery = supabase.from("centers").select("id, name").eq("is_active", true).order("name");
  if (scope !== "all" && user.centerIds.length > 0) {
    centerQuery = centerQuery.in("id", user.centerIds);
  }
  const { data: centerRows } = await centerQuery.returns<Array<{ id: string; name: string }>>();
  const centers = (centerRows ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Import {leadPlural}</h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV, map its columns, and import. A repeat phone number is never dropped — it&apos;s attached
          to the existing lead as a new enquiry instead. Assignment and stage are set automatically, same as any
          other lead source.
        </p>
      </div>
      <ImportWizard fields={fields} centers={centers} />
    </div>
  );
}
