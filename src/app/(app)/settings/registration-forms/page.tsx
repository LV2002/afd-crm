import Link from "next/link";
import { Plus } from "lucide-react";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import { FormRowActions } from "./form-row-actions";

interface FormRow {
  id: string;
  name: string;
  token: string;
  source: string;
  is_active: boolean;
  created_at: string;
  field_keys: string[];
}

export default async function RegistrationFormsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("registration_forms")
    .select("id, name, token, source, is_active, created_at, field_keys")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<FormRow[]>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Registration Forms</h1>
          <p className="text-sm text-muted-foreground">
            Public links a student fills in themselves. Answers arrive as leads through the same
            path as every other source, so duplicates are matched and assignment runs as usual.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/registration-forms/new">
            <Plus /> New form
          </Link>
        </Button>
      </div>

      {(rows ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No registration forms yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Attributed to</TableHead>
              <TableHead>Questions</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">{row.source}</TableCell>
                <TableCell className="text-muted-foreground">{row.field_keys.length}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateIST(row.created_at, "d MMM yyyy")}
                </TableCell>
                <TableCell>
                  <Badge variant={row.is_active ? "default" : "secondary"}>
                    {row.is_active ? "Open" : "Closed"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <FormRowActions id={row.id} token={row.token} isActive={row.is_active} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
