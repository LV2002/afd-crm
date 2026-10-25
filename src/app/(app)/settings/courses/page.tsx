import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can, getCurrentUser } from "@/lib/auth/session";
import { batchCapacity } from "@/lib/batches/roster";
import { db } from "@/lib/db/client";
import { batches, centers, dropdownOptions } from "@/lib/db/schema";
import { COURSE_MODE_KEY } from "@/lib/enrolment/course-catalog";
import { formatINR } from "@/lib/format/currency";
import { formatDateIST } from "@/lib/format/date";

import { CourseForm } from "./course-form";
import { CourseToggle } from "./course-toggle";

/**
 * Courses, and under each course its batches.
 *
 * A course is what AFD teaches and whether it is online or hybrid. A batch is
 * one running of it: at a centre, for an academic year, with a fee. Admission
 * picks a batch and takes the mode, year, centre and fee from it.
 */
export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const user = await getCurrentUser();
  if (!user || !(can(user, "settings.manage") || can(user, "batch.manage"))) return <AccessDenied />;
  const canEditCourses = can(user, "settings.manage");

  const [courseRows, modeOptions, batchRows] = await Promise.all([
    db
      .select({
        value: dropdownOptions.value,
        label: dropdownOptions.label,
        isActive: dropdownOptions.isActive,
        metadata: dropdownOptions.metadata,
      })
      .from(dropdownOptions)
      .where(and(eq(dropdownOptions.category, "course"), isNull(dropdownOptions.deletedAt)))
      .orderBy(asc(dropdownOptions.sortOrder), asc(dropdownOptions.label)),
    db
      .select({ value: dropdownOptions.value, label: dropdownOptions.label })
      .from(dropdownOptions)
      .where(
        and(
          eq(dropdownOptions.category, "preferred_mode"),
          eq(dropdownOptions.isActive, true),
          isNull(dropdownOptions.deletedAt),
        ),
      )
      .orderBy(asc(dropdownOptions.sortOrder)),
    db
      .select({
        id: batches.id,
        name: batches.name,
        course: batches.course,
        centerName: centers.name,
        academicYear: batches.academicYear,
        feePaise: batches.feePaise,
        startDate: batches.startDate,
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
      .orderBy(asc(batches.isActive), asc(batches.academicYear), asc(batches.name)),
  ]);

  const modeLabel = new Map(modeOptions.map((m) => [m.value, m.label]));
  const modes = modeOptions.map((m) => ({ value: m.value, label: m.label }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Courses &amp; batches</h1>
          <p className="text-sm text-muted-foreground">
            Each course is online or hybrid. Its batches sit under it — one per centre and academic
            year, each with its own fee. Admission takes the mode, year, centre and fee from the
            batch.
          </p>
        </div>
        {canEditCourses && <CourseForm modes={modes} />}
      </div>

      {courseRows.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No courses yet. Add the first one.
        </p>
      )}

      {courseRows.map((course) => {
        const mode = course.metadata?.[COURSE_MODE_KEY];
        const modeValue = typeof mode === "string" ? mode : "";
        const own = batchRows.filter((b) => b.course === course.value);
        return (
          <section
            key={course.value}
            className={`flex flex-col gap-3 rounded-lg border p-4 ${course.isActive ? "" : "opacity-60"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{course.label}</h2>
              {modeValue ? (
                <Badge variant="secondary">{modeLabel.get(modeValue) ?? modeValue}</Badge>
              ) : (
                <Badge variant="destructive">No mode</Badge>
              )}
              {!course.isActive && <Badge variant="outline">off</Badge>}
              <div className="ml-auto flex items-center gap-2">
                {canEditCourses && (
                  <>
                    <CourseForm
                      courseValue={course.value}
                      name={course.label}
                      mode={modeValue}
                      modes={modes}
                    />
                    <CourseToggle courseValue={course.value} isActive={course.isActive} />
                  </>
                )}
                {can(user, "batch.manage") && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/settings/batches/new?course=${encodeURIComponent(course.value)}`}>
                      <Plus className="size-4" /> Add batch
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {own.length === 0 ? (
              <p className="text-sm text-muted-foreground">No batches under this course yet.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-md border text-sm">
                {own.map((batch) => {
                  const cap = batchCapacity(batch.filled, batch.capacity);
                  return (
                    <li key={batch.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
                      <Link href={`/settings/batches/${batch.id}`} className="font-medium hover:underline">
                        {batch.name}
                      </Link>
                      <span className="text-muted-foreground">
                        {batch.centerName ?? "—"} · {batch.academicYear}
                        {batch.startDate ? ` · from ${formatDateIST(batch.startDate, "d MMM yyyy")}` : ""}
                      </span>
                      <span className="ml-auto flex items-center gap-3">
                        {batch.feePaise === null ? (
                          <Link
                            href={`/settings/batches/${batch.id}`}
                            className="text-amber-700 hover:underline dark:text-amber-400"
                          >
                            Set fee
                          </Link>
                        ) : (
                          <span className="tabular-nums">{formatINR(batch.feePaise)}</span>
                        )}
                        <span className="tabular-nums text-muted-foreground">
                          {batch.filled}
                          {cap.capacity === null ? " students" : ` / ${cap.capacity} seats`}
                        </span>
                        {!batch.isActive && <Badge variant="outline">ended</Badge>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
