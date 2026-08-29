import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { updateField } from "../actions";
import { FieldForm } from "../field-form";

export default async function EditFieldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: field } = await supabase
    .from("field_definitions")
    .select(
      "id, entity, key, label, help_text, type, section, is_required, show_in_list, show_in_filters, options, visible_to_roles, editable_by_roles, is_core",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!field) notFound();

  const { data: roles } = await supabase.from("roles").select("id, name").order("name").returns<
    Array<{ id: string; name: string }>
  >();

  const optionsLines = Array.isArray(field.options)
    ? (field.options as Array<{ value: string; label: string }>)
        .map((o) => `${o.value}:${o.label}`)
        .join("\n")
    : "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{field.label}</h1>
      <FieldForm
        values={{
          entity: field.entity,
          key: field.key,
          label: field.label,
          helpText: field.help_text ?? "",
          type: field.type,
          section: field.section,
          isRequired: field.is_required,
          showInList: field.show_in_list,
          showInFilters: field.show_in_filters,
          optionsLines,
          visibleToRoleIds: field.visible_to_roles ?? [],
          editableByRoleIds: field.editable_by_roles ?? [],
        }}
        roles={roles ?? []}
        locked={field.is_core}
        action={updateField.bind(null, field.id)}
        submitLabel="Save changes"
      />
    </div>
  );
}
