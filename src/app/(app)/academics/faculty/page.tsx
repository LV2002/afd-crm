import { and, asc, eq, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import {
  centers,
  dropdownOptions,
  faculty,
  facultyAvailability,
  facultyCenters,
  facultyLeave,
  facultySubjects,
  profiles,
} from "@/lib/db/schema";

import { FacultyRoster } from "./faculty-roster";

export const dynamic = "force-dynamic";

/**
 * The teaching staff, and everything the scheduler needs to know about
 * them.
 *
 * Built around how AFD actually staffs: a visiting faculty member is
 * confirmed on Thursday for Saturday. So adding somebody needs a name and
 * nothing else — subjects, centres, hours and a login are all optional and
 * can follow. A form that demanded a complete profile before it would save
 * is a form that gets bypassed, and then the list is wrong, and then the
 * timetable is wrong.
 *
 * Availability is opt-in for the same reason. Everybody is assumed free
 * unless they say otherwise; only a clash or a leave day stops them being
 * scheduled. Somebody who genuinely only comes at weekends can say so, and
 * then the windows are enforced.
 */
export default async function FacultyPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "faculty.read")) return <AccessDenied />;

  const canEdit = can(user, "faculty.manage");

  const [people, subjectRows, centreRows, windowRows, leaveRows, allCentres, subjectOptions, typeOptions, linkableUsers] =
    await Promise.all([
      db
        .select({
          id: faculty.id,
          fullName: faculty.fullName,
          phone: faculty.phone,
          email: faculty.email,
          employmentType: faculty.employmentType,
          availabilityMode: faculty.availabilityMode,
          profileId: faculty.profileId,
          notes: faculty.notes,
          isActive: faculty.isActive,
        })
        .from(faculty)
        .where(isNull(faculty.deletedAt))
        .orderBy(asc(faculty.fullName)),
      db.select().from(facultySubjects),
      db.select().from(facultyCenters),
      db
        .select()
        .from(facultyAvailability)
        .orderBy(asc(facultyAvailability.dayOfWeek), asc(facultyAvailability.startTime)),
      db.select().from(facultyLeave).orderBy(asc(facultyLeave.startDate)),
      db
        .select({ id: centers.id, name: centers.name })
        .from(centers)
        .where(and(eq(centers.isActive, true), isNull(centers.deletedAt)))
        .orderBy(asc(centers.name)),
      db
        .select({ value: dropdownOptions.value, label: dropdownOptions.label })
        .from(dropdownOptions)
        .where(
          and(
            eq(dropdownOptions.category, "subject"),
            eq(dropdownOptions.isActive, true),
            isNull(dropdownOptions.deletedAt),
          ),
        )
        .orderBy(asc(dropdownOptions.sortOrder)),
      db
        .select({ value: dropdownOptions.value, label: dropdownOptions.label })
        .from(dropdownOptions)
        .where(
          and(
            eq(dropdownOptions.category, "faculty_type"),
            eq(dropdownOptions.isActive, true),
            isNull(dropdownOptions.deletedAt),
          ),
        )
        .orderBy(asc(dropdownOptions.sortOrder)),
      db
        .select({ id: profiles.id, fullName: profiles.fullName })
        .from(profiles)
        .where(eq(profiles.isActive, true))
        .orderBy(asc(profiles.fullName)),
    ]);

  const subjectsByFaculty = groupBy(subjectRows, (row) => row.facultyId, (row) => row.subject);
  const centresByFaculty = groupBy(centreRows, (row) => row.facultyId, (row) => row.centerId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Faculty</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Who teaches, what they teach, and when they can. Only a name is required — add
          somebody in ten seconds today and fill in the rest when you know it. Everyone is
          assumed available unless you say otherwise; the timetable will only refuse a slot for
          a real clash or a leave day.
        </p>
      </div>

      <FacultyRoster
        people={people.map((person) => ({
          ...person,
          subjects: subjectsByFaculty.get(person.id) ?? [],
          centerIds: centresByFaculty.get(person.id) ?? [],
          windows: windowRows
            .filter((row) => row.facultyId === person.id)
            .map((row) => ({
              id: row.id,
              dayOfWeek: row.dayOfWeek,
              startTime: row.startTime,
              endTime: row.endTime,
            })),
          leave: leaveRows
            .filter((row) => row.facultyId === person.id)
            .map((row) => ({
              id: row.id,
              startDate: row.startDate,
              endDate: row.endDate,
              reason: row.reason,
            })),
        }))}
        centres={allCentres}
        subjectOptions={subjectOptions}
        typeOptions={typeOptions}
        linkableUsers={linkableUsers}
        canEdit={canEdit}
      />
    </div>
  );
}

/** One pass instead of a filter per person — the roster is small, but the shape is the point. */
function groupBy<Row, Value>(
  rows: Row[],
  key: (row: Row) => string,
  value: (row: Row) => Value,
): Map<string, Value[]> {
  const out = new Map<string, Value[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(value(row));
    else out.set(k, [value(row)]);
  }
  return out;
}
