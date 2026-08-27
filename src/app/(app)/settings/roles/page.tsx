import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_protected: boolean;
  role_permissions: Array<{ count: number }>;
}

export default async function RolesSettingsPage() {
  const supabase = await createClient();
  const { data: roles } = await supabase
    .from("roles")
    .select("id, code, name, description, is_protected, role_permissions(count)")
    .order("name")
    .returns<RoleRow[]>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Roles &amp; Permissions</h1>
          <p className="text-sm text-muted-foreground">
            Roles are data. Create one, give it a permission bundle, assign it to a user.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/roles/new">
            <Plus /> New role
          </Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(roles ?? []).map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <Link href={`/settings/roles/${role.id}`} className="font-medium hover:underline">
                  {role.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{role.code}</TableCell>
              <TableCell className="text-muted-foreground">
                {role.role_permissions[0]?.count ?? 0}
              </TableCell>
              <TableCell>{role.is_protected && <Badge variant="outline">Protected</Badge>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
