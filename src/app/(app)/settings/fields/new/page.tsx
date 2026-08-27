import { createClient } from "@/lib/supabase/server";

import { createField } from "../actions";
import { FieldForm } from "../field-form";

export default async function NewFieldPage() {
  const supabase = await createClient();
  const { data: roles } = await supabase.from("roles").select("id, name").order("name").returns<
    Array<{ id: string; name: string }>
  >();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">New field</h1>
      <FieldForm
        values={{
          entity: "lead",
          key: "",
          label: "",
          helpText: "",
          type: "text",
          section: "",
          isRequired: false,
          showInList: false,
          showInFilters: false,
          optionsLines: "",
          visibleToRoleIds: [],
          editableByRoleIds: [],
        }}
        roles={roles ?? []}
        locked={false}
        action={createField}
        submitLabel="Create field"
      />
    </div>
  );
}
