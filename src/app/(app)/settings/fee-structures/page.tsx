import Link from "next/link";
import { Plus } from "lucide-react";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatINR } from "@/lib/format/currency";
import { createClient } from "@/lib/supabase/server";

interface FeeStructureRow {
  id: string;
  course: string;
  mode: string;
  academic_year: string;
  base_fee_paise: number;
  is_active: boolean;
  centers: { name: string } | null;
}

export default async function FeeStructuresSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const { data: feeStructures } = await supabase
    .from("fee_structures")
    .select("id, course, mode, academic_year, base_fee_paise, is_active, centers(name)")
    .is("deleted_at", null)
    .order("academic_year", { ascending: false })
    .order("course")
    .returns<FeeStructureRow[]>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fee Structures</h1>
          <p className="text-sm text-muted-foreground">
            Base fee by course, centre, mode and academic year — looked up when a counsellor confirms an admission.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/fee-structures/new">
            <Plus /> New fee structure
          </Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Course</TableHead>
            <TableHead>Centre</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Academic year</TableHead>
            <TableHead>Base fee</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(feeStructures ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link href={`/settings/fee-structures/${row.id}`} className="font-medium hover:underline">
                  {row.course}
                </Link>
              </TableCell>
              <TableCell>{row.centers?.name ?? "—"}</TableCell>
              <TableCell>{row.mode}</TableCell>
              <TableCell>{row.academic_year}</TableCell>
              <TableCell>{formatINR(row.base_fee_paise)}</TableCell>
              <TableCell>
                <Badge variant={row.is_active ? "default" : "secondary"}>
                  {row.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {(feeStructures ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No fee structures yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
