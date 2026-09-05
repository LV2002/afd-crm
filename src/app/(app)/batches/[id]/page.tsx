import { and, asc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

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
import { batchCapacity, describeBatch } from "@/lib/batches/roster";
import { activeDropdownValues } from "@/lib/config/dropdown-values";
import { db } from "@/lib/db/client";
import { batches, centers, studentBatches, students } from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";

import { BatchForm } from "../batch-form";
import { AddStudentForm, RemoveStudentForm } from "./roster-controls";

/**
 * One batch: who is in it now, who has left, and the settings themselves.
 *
 * The roster is two lists rather than one with a status column. "Who is in
 * my Tuesday batch" is the question this page exists for, and mixing it
 * with people who left in March makes that question harder to answer for
 * no gain — the history is still here, underneath, where somebody looking
 * for it will find it.
 */
export const dynamic = "force-dynamic";

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "batch.manage")) return <AccessDenied />;

  const { id } = await params;

  const [batch] = await db
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
    })
    .from(batches)
    .leftJoin(centers, eq(centers.id, batches.centerId))
    .where(and(eq(batches.id, id), isNull(batches.deletedAt)));

  if (!batch) notFound();

  const memberRows = await db
    .select({
      membershipId: studentBatches.id,
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      status: students.status,
      joinedAt: studentBatches.joinedAt,
      leftAt: studentBatches.leftAt,
      reason: studentBatches.reason,
    })
    .from(studentBatches)
    .innerJoin(students, eq(students.id, studentBatches.studentId))
    .where(eq(studentBatches.batchId, id))
    .orderBy(asc(students.fullName));

  const current = memberRows.filter((row) => row.leftAt === null);
  const past = memberRows.filter((row) => row.leftAt !== null);
  const capacity = batchCapacity(current.length, batch.capacity);

  // Candidates: this centre's students who aren't already in the batch.
  // Narrowing here rather than offering everyone and refusing afterwards —
  // the action re-checks anyway (see checkAssignment), but a picker full of
  // choices that will be rejected is a worse screen.
  const inBatch = new Set(current.map((row) => row.studentId));
  const centreStudents = await db
    .select({ id: students.id, code: students.studentCode, name: students.fullName })
    .from(students)
    .where(and(eq(students.centerId, batch.centerId), isNull(students.deletedAt)))
    .orderBy(asc(students.fullName));
  const candidates = centreStudents
    .filter((student) => !inBatch.has(student.id))
    .map((student) => ({ id: student.id, label: `${student.name} · ${student.code}` }));

  const allCentres = await db
    .select({ id: centers.id, name: centers.name })
    .from(centers)
    .where(isNull(centers.deletedAt))
    .orderBy(asc(centers.name));
  const [courses, modes] = await Promise.all([
    activeDropdownValues("course"),
    activeDropdownValues("preferred_mode"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/batches" className="text-xs text-muted-foreground hover:underline">
            ← All batches
          </Link>
          <h1 className="text-2xl font-semibold">{batch.name}</h1>
          <p className="text-sm text-muted-foreground">
            {describeBatch(batch)} · {batch.centerName ?? "—"}
            {batch.startDate ? ` · from ${formatDateIST(batch.startDate, "d MMM yyyy")}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!batch.isActive && <Badge variant="outline">ended</Badge>}
          {capacity.isOverCapacity && (
            <Badge variant="destructive">
              {current.length} in a batch of {capacity.capacity}
            </Badge>
          )}
          <Badge variant="secondary">
            {current.length}
            {capacity.capacity === null ? " students" : ` of ${capacity.capacity}`}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Students</h2>
        <AddStudentForm batchId={batch.id} candidates={candidates} />

        {current.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nobody in this batch yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Joined the batch</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {current.map((row) => (
                  <TableRow key={row.membershipId}>
                    <TableCell>
                      <Link href={`/students/${row.studentId}`} className="font-medium hover:underline">
                        {row.fullName}
                      </Link>
                      {row.status !== "active" && (
                        <Badge variant="outline" className="ml-2 capitalize">
                          {row.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.studentCode}</TableCell>
                    <TableCell>{formatDateIST(row.joinedAt, "d MMM yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <RemoveStudentForm
                        batchId={batch.id}
                        studentId={row.studentId}
                        studentName={row.fullName}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Left this batch</h2>
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {past.map((row) => (
              <li key={row.membershipId} className="flex flex-wrap items-center gap-2 p-3">
                <span className="font-medium">{row.fullName}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateIST(row.joinedAt, "d MMM yyyy")} –{" "}
                  {formatDateIST(row.leftAt, "d MMM yyyy")}
                  {row.reason ? ` · ${row.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Batch settings</h2>
        <BatchForm
          values={{
            id: batch.id,
            name: batch.name,
            centerId: batch.centerId,
            course: batch.course,
            mode: batch.mode,
            academicYear: batch.academicYear,
            startDate: batch.startDate ?? "",
            endDate: batch.endDate ?? "",
            capacity: batch.capacity === null ? "" : String(batch.capacity),
            isActive: batch.isActive,
          }}
          centers={allCentres}
          courses={courses}
          modes={modes}
        />
      </div>
    </div>
  );
}
