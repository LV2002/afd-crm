import { asc, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { activeDropdownValues } from "@/lib/config/dropdown-values";
import { db } from "@/lib/db/client";
import { centers } from "@/lib/db/schema";

import { BatchForm } from "../batch-form";

/**
 * A centre head only sees their own centres in the picker — the action
 * checks the same thing again, but offering a choice that will be refused
 * is worse than not offering it.
 */
export const dynamic = "force-dynamic";

export default async function NewBatchPage() {
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

  const [courses, modes] = await Promise.all([
    activeDropdownValues("course"),
    activeDropdownValues("preferred_mode"),
  ]);

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
          course: courses[0] ?? "",
          mode: modes[0] ?? "",
          academicYear: "",
          startDate: "",
          endDate: "",
          capacity: "",
          isActive: true,
        }}
        centers={centres}
        courses={courses}
        modes={modes}
      />
    </div>
  );
}
