import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { NewRegistrationFormEditor } from "./editor";

interface FieldRow {
  key: string;
  label: string;
  type: string;
  section: string;
  is_core: boolean;
  is_required: boolean;
  sort_order: number;
}

interface CenterRow {
  id: string;
  name: string;
}

export default async function NewRegistrationFormPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const [{ data: fieldRows }, { data: centerRows }] = await Promise.all([
    supabase
      .from("field_definitions")
      .select("key, label, type, section, is_core, is_required, sort_order")
      .eq("entity", "lead")
      .is("deleted_at", null)
      .order("sort_order")
      .returns<FieldRow[]>(),
    supabase
      .from("centers")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .returns<CenterRow[]>(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">New registration form</h1>
        <p className="text-sm text-muted-foreground">
          Choose which questions to ask. The list comes from your lead fields, so a custom field
          you add in Settings → Custom Fields can be asked here too.
        </p>
      </div>
      <NewRegistrationFormEditor fields={fieldRows ?? []} centers={centerRows ?? []} />
    </div>
  );
}
