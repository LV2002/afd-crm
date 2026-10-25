import { asc, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { centers } from "@/lib/db/schema";
import { courseChoices } from "@/lib/enrolment/course-catalog";

import { BatchForm } from "../batch-form";

/**
 * A centre head only sees their own centres in the picker — the action
 * checks the same thing again, but offering a choice that will be refused
 * is worse than not offering it.
 */
export const dynamic = "force-dynamic";

export default async function NewBatchPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "batch.manage")) return <AccessDenied />;

  const allCentres = await db
    .select({ id: centers.id, name: centers.name })
    .from(centers)
    .where(isNull(centers.deletedAt))
    .orderBy(asc(centers.name));

  const centres =
    can(user, "settings.manage") || user.centerIds.length === 0
      ? allCentres
      : allCentres.filter((centre) => user.centerIds.includes(centre.id));

  const courses = await courseChoices();
  const { course: wanted } = await searchParams;
  const course = courses.find((c) => c.value === wanted) ?? courses[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">New batch</h1>
        <p className="text-sm text-muted-foreground">
          Create the class group first, then add students to it.
        </p>
      </div>

      <BatchForm
        values={{
          name: "",
          centerId: centres[0]?.id ?? "",
          course: course?.value ?? "",
          fee: "",
          academicYear: "",
          startDate: "",
          endDate: "",
          capacity: "",
          isActive: true,
        }}
        centers={centres}
        courses={courses}
      />
    </div>
  );
}
