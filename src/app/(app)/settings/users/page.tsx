import Link from "next/link";
import { Plus } from "lucide-react";

import { AccessDenied } from "@/components/layout/access-denied";
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
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

interface UserListRow {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  roles: { name: string } | null;
}

export default async function UsersSettingsPage() {
  // The settings layout only checks that the caller has *some* settings
  // permission (settingsNavFor) before rendering any /settings/* page, not
  // that they specifically hold users.manage — RLS on `profiles` already
  // scopes what this query can return (own/center/all), but this is the
  // same explicit per-page check every other settings mutation already
  // requires, applied here too rather than relying on RLS alone.
  const user = await getCurrentUser();
  if (!user || !can(user, "users.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_active, roles(name)")
    .order("full_name")
    .returns<UserListRow[]>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Staff accounts, roles and centre assignments.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/users/new">
            <Plus /> New user
          </Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(users ?? []).map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <Link href={`/settings/users/${u.id}`} className="font-medium hover:underline">
                  {u.full_name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell>{u.roles?.name ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={u.is_active ? "default" : "secondary"}>
                  {u.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
