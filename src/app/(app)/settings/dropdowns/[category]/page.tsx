import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { toOptionRowData } from "../option-row-data";
import { OptionsEditor } from "../options-editor";

export default async function DropdownCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const supabase = await createClient();

  const { data: categoryRow } = await supabase
    .from("dropdown_categories")
    .select("key, label, is_system")
    .eq("key", category)
    .maybeSingle();

  if (!categoryRow) notFound();

  const { data: optionRows } = await supabase
    .from("dropdown_options")
    .select("id, value, label, color, is_active, metadata")
    .eq("category", category)
    .is("deleted_at", null)
    .order("sort_order")
    .returns<
      Array<{
        id: string;
        value: string;
        label: string;
        color: string | null;
        is_active: boolean;
        metadata: unknown;
      }>
    >();

  // Flattened out of `metadata` here rather than passed as a blob: the row
  // editor should not have to know the shape of a jsonb column.
  const options = (optionRows ?? []).map(toOptionRowData);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{categoryRow.label}</h1>
        <p className="text-sm text-muted-foreground">{categoryRow.key}</p>
      </div>
      <OptionsEditor category={categoryRow.key} options={options} />
    </div>
  );
}
