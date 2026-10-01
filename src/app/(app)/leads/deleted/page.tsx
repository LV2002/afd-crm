import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { maskPhone } from "@/lib/leads/mask-phone";
import { createClient } from "@/lib/supabase/server";

import { RestoreButton } from "./restore-button";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  lead_number: number;
  student_name: string;
  primary_phone: string;
  deleted_at: string;
  deleted_reason: string | null;
  merged_into_lead_id: string | null;
  centers: { name: string } | null;
  profiles: { full_name: string } | null;
}

/**
 * The recycle bin. The reason a soft delete is worth the extra column.
 *
 * Without this screen, "delete" would be a one-way door with a reassuring
 * name: the row would still be in the database and nobody would be able to
 * reach it. Here, a lead deleted by mistake takes one click to put back, and
 * the reason somebody typed is on the row where the decision gets made.
 *
 * Merged leads appear too, marked as such, because they are soft-deleted by
 * the same column and leaving them out would make this list look like it was
 * hiding something. They cannot be restored from here — putting one back
 * would return a second copy of one person to the pipeline, which is the
 * thing the merge fixed.
 *
 * `lead.delete` rather than `lead.read`: the ability to see what somebody
 * else removed, and to undo it, is the same authority as removing it.
 */
export default async function DeletedLeadsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.delete")) return <AccessDenied />;

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("leads")
    .select(
      "id, lead_number, student_name, primary_phone, deleted_at, deleted_reason, merged_into_lead_id, centers(name), profiles!leads_deleted_by_fkey(full_name)",
    )
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(500)
    .returns<Row[]>();

  if (error) throw new Error(`Failed to load deleted leads: ${error.message}`);

  const deleted = rows ?? [];
  const canReveal = can(user, "lead.reveal_phone");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Deleted leads</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Nothing in this system is ever really deleted — a lead is hidden, and everything
          recorded against it is kept. Restore one and it returns to the pipeline exactly as it
          was, in whatever stage it was in.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lead #</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Centre</TableHead>
            <TableHead>Deleted</TableHead>
            <TableHead>By</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deleted.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-muted-foreground">{row.lead_number}</TableCell>
              <TableCell>
                <Link href={`/leads/${row.id}`} className="font-medium hover:underline">
                  {row.student_name}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">
                {canReveal ? row.primary_phone : maskPhone(row.primary_phone)}
              </TableCell>
              <TableCell>{row.centers?.name ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateIST(row.deleted_at, "d MMM yyyy")}
              </TableCell>
              <TableCell>{row.profiles?.full_name ?? "—"}</TableCell>
              <TableCell className="max-w-xs text-sm text-muted-foreground">
                {row.merged_into_lead_id ? (
                  <Badge variant="secondary">Merged into another lead</Badge>
                ) : (
                  (row.deleted_reason ?? "—")
                )}
              </TableCell>
              <TableCell className="text-right">
                {row.merged_into_lead_id ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  <RestoreButton leadId={row.id} />
                )}
              </TableCell>
            </TableRow>
          ))}
          {deleted.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                Nothing deleted. Everything that has ever come in is still in the pipeline.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
