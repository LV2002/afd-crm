import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { batches } from "./academics";

/**
 * What gets taught, in what order, and for how long.
 *
 * Three layers, deliberately separate, because they change at different
 * speeds and by different people:
 *
 *   1. The *syllabus* — modules and the topics inside them. Written once,
 *      shared by every course. "Perspective Drawing" is one topic whether
 *      Foundation spends four hours on it or Crash spends one.
 *
 *   2. The *plan* — one per course. Which of those topics that course
 *      covers, how many hours each gets, and, crucially, WHAT is covered:
 *      the same topic is taught to different depths in different courses,
 *      and until now that difference lived only in the coordinator's head.
 *
 *   3. The *timings* — which days and hours a batch actually meets. This
 *      is what turns "48 hours of teaching" into "finishes on 12
 *      November", and what the timetable generator will fill.
 *
 * Splitting 1 from 2 is the whole point. A single flat "syllabus per
 * batch" spreadsheet — which is what exists today — means renaming a topic
 * is eight edits, and comparing two courses is impossible. Here the
 * vocabulary is shared and only the depth varies.
 *
 * Nothing here is centre-scoped: a course's curriculum is the same in
 * Kochi and Kannur. Batch timings are centre-scoped, because a batch is.
 */

/**
 * What a line in a course plan actually is.
 *
 * Not one row per topic with three hour columns, because the three kinds
 * schedule differently: teaching follows the syllabus order, practice
 * usually trails the teaching it reinforces, and a mock test occupies a
 * whole session and often sits at a module boundary rather than inside
 * one. One row per scheduled block keeps the generator honest — it places
 * blocks, and a block is a block.
 */
export const curriculumItemKindEnum = pgEnum("curriculum_item_kind", [
  "teaching",
  "practice",
  "mock_test",
  "revision",
]);

/**
 * A module of the syllabus — the top level of the tree.
 *
 * `subject` groups modules for the human reading the list, and later gives
 * the timetable generator something to vary: three weeks of nothing but
 * drawing is a worse week than the same hours interleaved, and the
 * generator can only know that if it knows which subject a block belongs
 * to. A `dropdown_options` value in category `subject`, never an enum.
 */
export const syllabusModules = pgTable(
  "syllabus_modules",
  {
    id: idColumn(),
    name: text("name").notNull(),
    subject: text("subject"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index("syllabus_modules_sort_idx").on(t.sortOrder)],
);

/** A topic inside a module. The smallest thing the timetable ever places. */
export const syllabusTopics = pgTable(
  "syllabus_topics",
  {
    id: idColumn(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => syllabusModules.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index("syllabus_topics_module_idx").on(t.moduleId, t.sortOrder)],
);

/**
 * The plan for one course.
 *
 * `course` is the `dropdown_options` value in category `course` — the same
 * string `batches.course` carries. A text key rather than a foreign key
 * because that is how `batches` already refers to a course, and two
 * different ways of naming the same thing is how they drift apart.
 *
 * `teachingEndDate` is the date the syllabus must be finished by — for
 * AFD's 2026 intake, mid-November, after which sessions turn into past
 * paper solving. It is what makes the pacing check possible: planned hours
 * against hours actually available before that date.
 */
export const courseCurricula = pgTable(
  "course_curricula",
  {
    id: idColumn(),
    course: text("course").notNull(),
    academicYear: text("academic_year"),
    teachingEndDate: text("teaching_end_date"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [uniqueIndex("course_curricula_course_year_uq").on(t.course, t.academicYear)],
);

/**
 * One scheduled block in a course's plan.
 *
 * `coverage` is the field this whole feature exists for: free text saying
 * what, specifically, is taught in this block for this course. The same
 * topic row appears in Foundation and in Crash with different hours and a
 * different `coverage`, and that difference is the coordinator's actual
 * expertise — the thing that has never been written down anywhere.
 *
 * `topicId` is nullable on purpose. A mock test belongs to a module, not
 * to any one topic inside it, and a revision block often spans the module
 * entire. `moduleId` is always set, so every block has somewhere to sit in
 * the ordering even when it names no topic.
 */
export const curriculumItems = pgTable(
  "curriculum_items",
  {
    id: idColumn(),
    curriculumId: uuid("curriculum_id")
      .notNull()
      .references(() => courseCurricula.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => syllabusModules.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").references(() => syllabusTopics.id, { onDelete: "cascade" }),
    kind: curriculumItemKindEnum("kind").notNull().default("teaching"),
    /** Hours, to a quarter. numeric, not float: 1.75 must stay 1.75. */
    hours: numeric("hours", { precision: 5, scale: 2 }).notNull().default("0"),
    coverage: text("coverage"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index("curriculum_items_curriculum_idx").on(t.curriculumId, t.sortOrder),
    index("curriculum_items_module_idx").on(t.moduleId),
    index("curriculum_items_topic_idx").on(t.topicId),
  ],
);

/**
 * Which half of the day a session sits in.
 *
 * Attendance is marked per half — the coordinator's existing sheet has a
 * morning column and an evening column — so the half is a property of the
 * slot, not something derived from the clock at read time. A batch that
 * meets 10:00–13:00 is a morning session even on the day it overruns.
 */
export const daySessionEnum = pgEnum("day_session", ["morning", "evening"]);

/**
 * When a batch meets, week in and week out.
 *
 * The recurring pattern, not the calendar: "Saturdays 10:00–13:00,
 * mornings". The timetable generator expands this into actual dates,
 * skipping holidays, and fills each expanded slot with the next unplaced
 * curriculum block.
 *
 * Kept separate from `batches` rather than as a jsonb column on it,
 * because a batch commonly meets on several days with different hours,
 * and because the generator wants to query slots by weekday across every
 * batch at once when it checks a faculty member for a clash.
 */
export const batchSessions = pgTable(
  "batch_sessions",
  {
    id: idColumn(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    /** 0 = Sunday, matching Postgres `extract(dow)` and JS `getDay()`. */
    dayOfWeek: integer("day_of_week").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    daySession: daySessionEnum("day_session").notNull().default("morning"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index("batch_sessions_batch_idx").on(t.batchId, t.dayOfWeek)],
);
