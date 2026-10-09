import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { isInterestedOption } from "@/lib/leads/interested-temperature";

import type { OptionRowData } from "../option-row";
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
    .returns<Array<Omit<OptionRowData, "interested"> & { metadata: unknown }>>();

  // The flag is flattened out of `metadata` here rather than passed as a
  // blob: the row editor should not have to know the shape of a jsonb
  // column, and `metadata` carries other keys (the temperature `rank`)
  // that are nobody's business on this screen.
  const options: OptionRowData[] = (optionRows ?? []).map(({ metadata, ...row }) => ({
    ...row,
    interested: isInterestedOption(metadata),
  }));

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
