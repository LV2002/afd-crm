import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import type { PermissionCode } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { DeleteRoleButton } from "../delete-role-button";
import { EditRoleForm } from "../edit-role-form";
import { PermissionGrid } from "../permission-grid";

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: role } = await supabase
    .from("roles")
    .select("id, name, code, description, is_protected")
    .eq("id", id)
    .maybeSingle();

  if (!role) notFound();

  const { data: grants } = await supabase
    .from("role_permissions")
    .select("permission_code, scope")
    .eq("role_id", id)
    .returns<Array<{ permission_code: PermissionCode; scope: string }>>();

  const currentScopes: Partial<Record<PermissionCode, string>> = {};
  for (const grant of grants ?? []) {
    currentScopes[grant.permission_code] = grant.scope;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{role.name}</h1>
          <span className="text-sm text-muted-foreground">{role.code}</span>
          {role.is_protected && <Badge variant="outline">Protected</Badge>}
        </div>
        <DeleteRoleButton roleId={role.id} isProtected={role.is_protected} />
      </div>

      <EditRoleForm roleId={role.id} name={role.name} description={role.description ?? ""} />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Permission bundle</h2>
        <PermissionGrid roleId={role.id} isProtected={role.is_protected} currentScopes={currentScopes} />
      </div>
    </div>
  );
}
