import Link from "next/link";
import { Plus } from "lucide-react";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

interface TagRow {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
}

export default async function TagsSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const { data: tagRows } = await supabase
    .from("tags")
    .select("id, name, color, is_active")
    .is("deleted_at", null)
    .order("name")
    .returns<TagRow[]>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="text-sm text-muted-foreground">
            Labels a lead can carry — for segmentation and, later, retargeting audiences.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/tags/new">
            <Plus /> New tag
          </Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(tagRows ?? []).map((tag) => (
            <TableRow key={tag.id}>
              <TableCell>
                <Link href={`/settings/tags/${tag.id}`} className="flex items-center gap-2 font-medium hover:underline">
                  <span
                    className="size-3 shrink-0 rounded-full border"
                    style={{ backgroundColor: tag.color ?? "#94a3b8" }}
                  />
                  {tag.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={tag.is_active ? "default" : "secondary"}>
                  {tag.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {(tagRows ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground">
                No tags yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
