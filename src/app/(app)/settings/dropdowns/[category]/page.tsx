import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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

  const { data: options } = await supabase
    .from("dropdown_options")
    .select("id, value, label, color, is_active")
    .eq("category", category)
    .is("deleted_at", null)
    .order("sort_order")
    .returns<OptionRowData[]>();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{categoryRow.label}</h1>
        <p className="text-sm text-muted-foreground">{categoryRow.key}</p>
      </div>
      <OptionsEditor category={categoryRow.key} options={options ?? []} />
    </div>
  );
}
