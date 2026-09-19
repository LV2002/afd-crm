import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { centers } from "./org";

/**
 * Who teaches, what they can teach, and when they can.
 *
 * ## Why faculty are not just users
 *
 * A faculty member is a *record about a person*, not necessarily a login.
 * Visiting faculty come for one module and never touch the CRM; a
 * full-timer grades homework in it every week. Making every faculty member
 * a `profiles` row would mean creating an auth account — email, password,
 * the lockout invariants — before the coordinator could put a name against
 * Saturday's class, which is exactly the friction that keeps this kind of
 * thing in a spreadsheet.
 *
 * So `profile_id` is nullable. Add a name in ten seconds; link a login
 * later, when and if that person needs one.
 *
 * ## Why availability is opt-in
 *
 * `availability_mode` is `always` by default: the person is assumed free
 * and only a real clash or a leave day stops them being scheduled. A
 * whitelist of windows is more precise and nobody fills it in, so the
 * precise version is available (`by_window`) and not compulsory. AFD's
 * staffing changes late and often; a model that demands a complete
 * timetable of everyone's free hours before it will schedule anything is a
 * model that gets bypassed.
 *
 * ## Access
 *
 * Deliberately NOT centre-scoped. A visiting faculty member teaches at
 * both centres, and a centre head planning a week needs to see who is
 * available institute-wide before asking for them. Centre membership here
 * is for filtering and for the scheduler's clash check, not an access
 * boundary — the gate is the `faculty.read` / `faculty.manage` pair.
 */

export const facultyAvailabilityModeEnum = pgEnum("faculty_availability_mode", [
  "always",
  "by_window",
]);

export const faculty = pgTable(
  "faculty",
  {
    id: idColumn(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    /**
     * The login, if this person has one. Null for visiting faculty who
     * never sign in. `set null` rather than cascade: deactivating somebody's
     * account must not delete the record of who taught Tuesday's class.
     */
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
    /** `dropdown_options` category `faculty_type` — Full time, Visiting, Part time. */
    employmentType: text("employment_type"),
    availabilityMode: facultyAvailabilityModeEnum("availability_mode")
      .notNull()
      .default("always"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index("faculty_name_idx").on(t.fullName), index("faculty_profile_idx").on(t.profileId)],
);

/** Which centres a person teaches at. Many, because visiting faculty travel. */
export const facultyCenters = pgTable(
  "faculty_centers",
  {
    facultyId: uuid("faculty_id")
      .notNull()
      .references(() => faculty.id, { onDelete: "cascade" }),
    centerId: uuid("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.facultyId, t.centerId] })],
);

/**
 * What a person can teach, by subject.
 *
 * Subject rather than module: a module list goes stale every time the
 * syllabus is edited, and "Athira teaches Drawing" is both true for longer
 * and the way the institute actually talks. `subject` matches
 * `syllabus_modules.subject`, so the scheduler can go from a block to its
 * module to its subject to the people who can take it.
 */
export const facultySubjects = pgTable(
  "faculty_subjects",
  {
    facultyId: uuid("faculty_id")
      .notNull()
      .references(() => faculty.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
  },
  (t) => [primaryKey({ columns: [t.facultyId, t.subject] })],
);

/**
 * A recurring window this person IS free — only consulted when their
 * `availability_mode` is `by_window`. Same shape as `batch_sessions` so
 * the overlap check is one function, not two.
 */
export const facultyAvailability = pgTable(
  "faculty_availability",
  {
    id: idColumn(),
    facultyId: uuid("faculty_id")
      .notNull()
      .references(() => faculty.id, { onDelete: "cascade" }),
    /** 0 = Sunday, matching Postgres `extract(dow)` and JS `getDay()`. */
    dayOfWeek: integer("day_of_week").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    ...timestamps(),
  },
  (t) => [index("faculty_availability_faculty_idx").on(t.facultyId, t.dayOfWeek)],
);

/**
 * One-off absence: a wedding, an exam board, a fortnight away.
 *
 * Inclusive of both dates, because that is how a person says it — "I'm
 * away the 12th to the 15th" means four days, not three.
 */
export const facultyLeave = pgTable(
  "faculty_leave",
  {
    id: idColumn(),
    facultyId: uuid("faculty_id")
      .notNull()
      .references(() => faculty.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason"),
    ...timestamps(),
  },
  (t) => [index("faculty_leave_faculty_idx").on(t.facultyId, t.startDate)],
);
