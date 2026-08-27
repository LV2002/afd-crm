import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

import { AssignedCenters, type CenterRow } from "./assigned-centers";
import { EditUserForm } from "./edit-user-form";
import { UserActiveToggle } from "./active-toggle";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, is_active, role_id")
    .eq("id", id)
    .maybeSingle();

  if (!profile) notFound();

  const [{ data: roles }, { data: centers }, { data: assignments }] = await Promise.all([
    supabase.from("roles").select("id, name").order("name").returns<Array<{ id: string; name: string }>>(),
    supabase.from("centers").select("id, name").order("name").returns<Array<{ id: string; name: string }>>(),
    supabase
      .from("user_centers")
      .select("center_id")
      .eq("user_id", id)
      .returns<Array<{ center_id: string }>>(),
  ]);

  const assignedIds = new Set((assignments ?? []).map((a) => a.center_id));
  const centerRows: CenterRow[] = (centers ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    assigned: assignedIds.has(c.id),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{profile.full_name}</h1>
          <Badge variant={profile.is_active ? "default" : "secondary"}>
            {profile.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <UserActiveToggle userId={profile.id} isActive={profile.is_active} />
      </div>
      <p className="-mt-6 text-sm text-muted-foreground">{profile.email}</p>

      <EditUserForm
        userId={profile.id}
        fullName={profile.full_name}
        phone={profile.phone ?? ""}
        roleId={profile.role_id}
        roles={roles ?? []}
      />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Centres</h2>
        <AssignedCenters userId={profile.id} centers={centerRows} />
      </div>
    </div>
  );
}
