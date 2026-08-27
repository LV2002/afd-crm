import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

import { updateCenter } from "../actions";
import { CenterForm } from "../center-form";
import { ActiveToggle } from "./active-toggle";
import { AssignedUsers, type UserRow } from "./assigned-users";

export default async function EditCenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: center } = await supabase
    .from("centers")
    .select("id, name, city, address, timezone, is_active")
    .eq("id", id)
    .maybeSingle();

  if (!center) notFound();

  const [{ data: profiles }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").order("full_name").returns<
      Array<{ id: string; full_name: string; email: string }>
    >(),
    supabase
      .from("user_centers")
      .select("user_id")
      .eq("center_id", id)
      .returns<Array<{ user_id: string }>>(),
  ]);

  const assignedIds = new Set((assignments ?? []).map((a) => a.user_id));
  const userRows: UserRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    email: p.email,
    assigned: assignedIds.has(p.id),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{center.name}</h1>
          <Badge variant={center.is_active ? "default" : "secondary"}>
            {center.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <ActiveToggle centerId={center.id} isActive={center.is_active} />
      </div>

      <CenterForm
        values={{
          name: center.name,
          city: center.city,
          address: center.address ?? "",
          timezone: center.timezone,
        }}
        action={updateCenter.bind(null, center.id)}
        submitLabel="Save changes"
      />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Assigned users</h2>
        <AssignedUsers centerId={center.id} users={userRows} />
      </div>
    </div>
  );
}
