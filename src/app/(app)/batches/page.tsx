import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";

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
import { batchCapacity, describeBatch } from "@/lib/batches/roster";
import { db } from "@/lib/db/client";
import { batchSessions, batches, centers } from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";

/**
 * Every batch, with how full it is.
 *
 * `batches` has had a table since Phase 4 and no screen, so it has sat
 * empty and the Batch column on the students list has been permanently
 * blank. This is the screen.
 *
 * The member count is a live count from `student_batches` rather than a
 * number stored on the batch: a stored count is one more thing to keep in
 * step, and it goes wrong silently the first time somebody leaves.
 */
export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "batch.manage")) return <AccessDenied />;

  const rows = await db
    .select({
      id: batches.id,
      name: batches.name,
      centerId: batches.centerId,
      centerName: centers.name,
      course: batches.course,
      mode: batches.mode,
      academicYear: batches.academicYear,
      startDate: batches.startDate,
      endDate: batches.endDate,
      capacity: batches.capacity,
      isActive: batches.isActive,
      filled: sql<number>`(
        select count(*)::int from student_batches sb
        where sb.batch_id = ${batches.id} and sb.left_at is null
      )`,
    })
    .from(batches)
    .leftJoin(centers, eq(centers.id, batches.centerId))
    .where(isNull(batches.deletedAt))
    .orderBy(asc(batches.isActive), asc(centers.name), asc(batches.name));

  // Running batches first — the ones somebody is actually managing.
  const ordered = [...rows].sort((a, b) => Number(b.isActive) - Number(a.isActive));

  // Which batches have no timings. A batch without them cannot be put on a
  // timetable, and that is invisible from the batch's own row until you
  // open it — so it is called out here instead.
  const timed = new Set(
    (
      await db
        .selectDistinct({ batchId: batchSessions.batchId })
        .from(batchSessions)
        .where(and(eq(batchSessions.isActive, true), isNull(batchSessions.deletedAt)))
    ).map((row) => row.batchId),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Batches</h1>
          <p className="text-sm text-muted-foreground">
            Class groups students are taught in. A student&apos;s batch shows on their record and
            on the students list.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/batches/new">
            <Plus className="size-4" /> New batch
          </Link>
        </Button>
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No batches yet. Create one, then add students to it from the batch or from their own
          record.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Timings</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Seats left</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((row) => {
                const capacity = batchCapacity(row.filled, row.capacity);
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link href={`/batches/${row.id}`} className="font-medium hover:underline">
                        {row.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {describeBatch({
                          id: row.id,
                          name: row.name,
                          centerId: row.centerId,
                          centerName: row.centerName,
                          course: row.course,
                          mode: row.mode,
                          academicYear: row.academicYear,
                          startDate: row.startDate,
                          endDate: row.endDate,
                          capacity: row.capacity,
                          isActive: row.isActive,
                        })}
                      </p>
                    </TableCell>
                    <TableCell>{row.centerName ?? "—"}</TableCell>
                    <TableCell>
                      {timed.has(row.id) ? (
                        <Link
                          href={`/batches/${row.id}`}
                          className="text-sm text-muted-foreground hover:underline"
                        >
                          set
                        </Link>
                      ) : (
                        <Badge variant="outline">none yet</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDateIST(row.startDate, "d MMM yyyy")}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.filled}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {capacity.capacity === null ? (
                        <span className="text-muted-foreground">no limit</span>
                      ) : capacity.isOverCapacity ? (
                        <Badge variant="destructive">{row.filled - capacity.capacity} over</Badge>
                      ) : capacity.isFull ? (
                        <Badge variant="secondary">full</Badge>
                      ) : (
                        capacity.spacesLeft
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!row.isActive && <Badge variant="outline">ended</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
