import { createClient } from "@/lib/supabase/server";

import { createField } from "../actions";
import { FieldForm } from "../field-form";
import { FIELD_ENTITIES } from "../constants";

/**
 * `?entity=student` preselects the entity, so "Add a question" on
 * Settings → Student Profile Form lands on a form that is already about a
 * student rather than making the admin remember to change a dropdown they
 * didn't know mattered. The value is still validated against
 * FIELD_ENTITIES — a query string is user input.
 */
export default async function NewFieldPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const defaultEntity = FIELD_ENTITIES.find((e) => e === entity) ?? "lead";

  const supabase = await createClient();
  const { data: roles } = await supabase.from("roles").select("id, name").order("name").returns<
    Array<{ id: string; name: string }>
  >();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {defaultEntity === "student" ? "New question" : "New field"}
      </h1>
      <FieldForm
        values={{
          entity: defaultEntity,
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
        submitLabel={defaultEntity === "student" ? "Create question" : "Create field"}
      />
    </div>
  );
}
