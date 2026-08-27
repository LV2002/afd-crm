import Link from "next/link";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

import { NewCategoryForm } from "./new-category-form";

interface CategoryRow {
  key: string;
  label: string;
  is_system: boolean;
  dropdown_options: Array<{ count: number }>;
}

export default async function DropdownsSettingsPage() {
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("dropdown_categories")
    .select("key, label, is_system, dropdown_options(count)")
    .order("label")
    .returns<CategoryRow[]>();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dropdowns</h1>
        <p className="text-sm text-muted-foreground">
          Every enumerated list in the system. Temperature has its own screen since it also
          drives assignment rules — see Temperatures.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(categories ?? [])
          .filter((c) => c.key !== "temperature")
          .map((category) => (
            <Link key={category.key} href={`/settings/dropdowns/${category.key}`}>
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardHeader>
                  <CardTitle className="text-base">{category.label}</CardTitle>
                  <CardDescription>
                    {category.dropdown_options[0]?.count ?? 0} option(s)
                    {category.is_system ? " · system" : ""}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
      </div>
      <div className="max-w-md">
        <h2 className="mb-2 text-lg font-medium">New category</h2>
        <NewCategoryForm />
      </div>
    </div>
  );
}
