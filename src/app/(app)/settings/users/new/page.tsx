import { createClient } from "@/lib/supabase/server";

import { NewUserForm } from "../new-user-form";

export default async function NewUserPage() {
  const supabase = await createClient();
  const [{ data: roles }, { data: centers }] = await Promise.all([
    supabase.from("roles").select("id, name").order("name").returns<Array<{ id: string; name: string }>>(),
    supabase
      .from("centers")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .returns<Array<{ id: string; name: string }>>(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">New user</h1>
      <NewUserForm roles={roles ?? []} centers={centers ?? []} />
    </div>
  );
}
