import { and, asc, eq, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import {
  batchSessions,
  batches,
  courseCurricula,
  curriculumItems,
  dropdownOptions,
  syllabusModules,
  syllabusTopics,
} from "@/lib/db/schema";
import { assessPacing, type PlannedBlock, type SessionSlot } from "@/lib/curriculum/pacing";

import { CoursePlan } from "./course-plan";
import { ModuleTree } from "./module-tree";

export const dynamic = "force-dynamic";

/**
 * Where the syllabus gets written down.
 *
 * The coordinator's job today is a Google Sheet that only she can read,
 * and rebuilding a week's timetable from it takes two to three days.
 * This screen is the structured version of that sheet: modules and topics
 * on the left as shared vocabulary, and on the right one course's plan —
 * which topics it covers, for how many hours, and what specifically is
 * taught.
 *
 * Two deliberate choices about how it reads:
 *
 *   - The pacing panel is at the top, not the bottom. The one question
 *     worth answering every time she opens this is "does it still fit
 *     before mid-November", and an answer below sixty rows of form is an
 *     answer nobody sees.
 *
 *   - Hours are shown as a running total per module, not only per row. A
 *     plan is wrong at the module level long before it is wrong at the
 *     topic level, and that is the level she thinks in.
 *
 * Reads run on the direct db client. Everything here is either
 * institute-wide configuration (the syllabus) or already gated by the
 * permission check below, and the writes in actions.ts all go through the
 * RLS-bound client where the real enforcement is.
 */
export default async function SyllabusPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "curriculum.read")) return <AccessDenied />;

  const canEdit = can(user, "curriculum.manage");
  const { plan: selectedPlanId } = await searchParams;

  const [modules, topics, plans, courseOptions, subjectOptions] = await Promise.all([
    db
      .select()
      .from(syllabusModules)
      .where(isNull(syllabusModules.deletedAt))
      .orderBy(asc(syllabusModules.sortOrder), asc(syllabusModules.name)),
    db
      .select()
      .from(syllabusTopics)
      .where(isNull(syllabusTopics.deletedAt))
      .orderBy(asc(syllabusTopics.sortOrder), asc(syllabusTopics.name)),
    db
      .select()
      .from(courseCurricula)
      .where(isNull(courseCurricula.deletedAt))
      .orderBy(asc(courseCurricula.course)),
    db
      .select({ value: dropdownOptions.value, label: dropdownOptions.label })
      .from(dropdownOptions)
      .where(
        and(
          eq(dropdownOptions.category, "course"),
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
          eq(dropdownOptions.category, "subject"),
          eq(dropdownOptions.isActive, true),
          isNull(dropdownOptions.deletedAt),
        ),
      )
      .orderBy(asc(dropdownOptions.sortOrder)),
  ]);

  // Default to the first plan rather than an empty right-hand side: with
  // one plan, which is where AFD starts, a chooser that defaults to
  // nothing is a screen that looks broken.
  const activePlan = plans.find((p) => p.id === selectedPlanId) ?? plans[0] ?? null;

  const items = activePlan
    ? await db
        .select()
        .from(curriculumItems)
        .where(
          and(
            eq(curriculumItems.curriculumId, activePlan.id),
            isNull(curriculumItems.deletedAt),
          ),
        )
        .orderBy(asc(curriculumItems.sortOrder))
    : [];

  const pacing = activePlan?.teachingEndDate
    ? assessPacing({
        slots: await slotsForCourse(activePlan.course),
        blocks: items.map(
          (item): PlannedBlock => ({ kind: item.kind, hours: Number(item.hours) }),
        ),
        fromDate: new Date().toISOString().slice(0, 10),
        teachingEndDate: activePlan.teachingEndDate,
      })
    : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Syllabus</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The modules and topics on the left are shared by every course — write a topic once.
          The plan on the right is what one course does with them: how many hours each topic
          gets, and exactly what is covered. The same topic can be four hours in Foundation and
          one in Crash, and that difference is what this page exists to record.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ModuleTree
          modules={modules}
          topics={topics}
          subjectOptions={subjectOptions}
          canEdit={canEdit}
        />
        <CoursePlan
          plans={plans}
          activePlan={activePlan}
          items={items}
          modules={modules}
          topics={topics}
          courseOptions={courseOptions}
          pacing={pacing}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}

/**
 * The weekly meeting pattern of the batches running this course.
 *
 * A course does not itself have timings — a batch does — so the pacing
 * check needs a representative batch. It takes the busiest one currently
 * running: that is the optimistic case, and a plan that does not fit even
 * the batch with the most hours does not fit anywhere. The pessimistic
 * per-batch view belongs on the batch page, where the batch is named.
 */
async function slotsForCourse(course: string): Promise<SessionSlot[]> {
  const rows = await db
    .select({
      batchId: batchSessions.batchId,
      dayOfWeek: batchSessions.dayOfWeek,
      startTime: batchSessions.startTime,
      endTime: batchSessions.endTime,
    })
    .from(batchSessions)
    .innerJoin(batches, eq(batches.id, batchSessions.batchId))
    .where(
      and(
        eq(batches.course, course),
        eq(batches.isActive, true),
        eq(batchSessions.isActive, true),
        isNull(batches.deletedAt),
        isNull(batchSessions.deletedAt),
      ),
    )
    .orderBy(asc(batchSessions.batchId), asc(batchSessions.dayOfWeek));

  if (rows.length === 0) return [];

  const byBatch = new Map<string, SessionSlot[]>();
  for (const row of rows) {
    const slot: SessionSlot = {
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
    };
    const list = byBatch.get(row.batchId);
    if (list) list.push(slot);
    else byBatch.set(row.batchId, [slot]);
  }

  let best: SessionSlot[] = [];
  for (const slots of byBatch.values()) {
    if (slots.length > best.length) best = slots;
  }
  return best;
}
