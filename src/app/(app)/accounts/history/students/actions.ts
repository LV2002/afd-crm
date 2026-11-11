"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { batches, centers, dropdownOptions, enrolments, interactions, leads } from "@/lib/db/schema";
import { groupKey, matchCourse, matchExams, parseAdmittedCsv, type AdmittedRow, type CourseOption } from "@/lib/enrolment/admitted-students";
import { confirmAdmission } from "@/lib/enrolment/confirm-admission";
import { COURSE_MODE_KEY } from "@/lib/enrolment/course-catalog";
import { createStudentFromEnrolment } from "@/lib/enrolment/create-student";
import { dropAdmission } from "@/lib/enrolment/drop-admission";
import { findLeadByPhone } from "@/lib/identity/find-lead-by-phone";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";
import { createClient } from "@/lib/supabase/server";

export interface AdmittedGroup {
  /** Identifies the group in the form: centre and the course as the sheet writes it. */
  key: string;
  centre: string;
  centerId: string | null;
  sheet: string;
  count: number;
  /** The CRM course value it matched on its own, if it did. */
  matchedCourse: string | null;
  note?: string;
}

export interface AdmittedState {
  error?: string;
  preview?: {
    total: number;
    ready: number;
    dropped: number;
    alreadyAdmitted: string[];
    groups: AdmittedGroup[];
    courses: Array<{ value: string; label: string }>;
    batches: Array<{ id: string; label: string; course: string; centerId: string }>;
    unknownCentres: string[];
    problems: Array<{ line: number; name: string; message: string }>;
  };
  result?: {
    added: number;
    attached: number;
    dropped: number;
    skipped: Array<{ line: number; name: string; message: string }>;
  };
}

const MAX_BYTES = 1_500_000;
const MAX_ROWS = 600;

async function loadContext() {
  const [centreRows, courseRows, modeRows, examRows] = await Promise.all([
    db.select({ id: centers.id, name: centers.name }).from(centers).where(isNull(centers.deletedAt)),
    db
      .select({ value: dropdownOptions.value, label: dropdownOptions.label, metadata: dropdownOptions.metadata })
      .from(dropdownOptions)
      .where(and(eq(dropdownOptions.category, "course"), eq(dropdownOptions.isActive, true), isNull(dropdownOptions.deletedAt))),
    db
      .select({ value: dropdownOptions.value, label: dropdownOptions.label })
      .from(dropdownOptions)
      .where(and(eq(dropdownOptions.category, "preferred_mode"), isNull(dropdownOptions.deletedAt))),
    db
      .select({ value: dropdownOptions.value, label: dropdownOptions.label })
      .from(dropdownOptions)
      .where(and(eq(dropdownOptions.category, "exam"), isNull(dropdownOptions.deletedAt))),
  ]);
  const batchRows = await db
    .select({ id: batches.id, name: batches.name, course: batches.course, mode: batches.mode, centerId: batches.centerId, academicYear: batches.academicYear })
    .from(batches)
    .where(and(eq(batches.isActive, true), isNull(batches.deletedAt)));
  const modeLabel = new Map(modeRows.map((m) => [m.value, m.label]));
  const courses: CourseOption[] = courseRows.map((c) => {
    const mode = typeof c.metadata?.[COURSE_MODE_KEY] === "string" ? String(c.metadata[COURSE_MODE_KEY]) : null;
    return { value: c.value, label: c.label, mode, modeLabel: mode ? (modeLabel.get(mode) ?? mode) : null };
  });
  const centreId = (name: string) => centreRows.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? null;
  return { courses, exams: examRows, centreId, batches: batchRows };
}

/** Groups the rows by centre and course, and says which CRM course each matched on its own. */
function plan(rows: AdmittedRow[], ctx: Awaited<ReturnType<typeof loadContext>>) {
  const groups = new Map<string, AdmittedGroup>();
  const unknownCentres = new Set<string>();
  for (const r of rows) {
    const key = groupKey(r.centre, r.course);
    let g = groups.get(key);
    if (!g) {
      const m = matchCourse(r.course, ctx.courses);
      g = {
        key,
        centre: r.centre,
        centerId: ctx.centreId(r.centre),
        sheet: r.course,
        count: 0,
        matchedCourse: m.kind === "ok" ? m.course.value : null,
        note: m.kind === "ambiguous" ? `fits more than one course: ${m.options.join(", ")}` : undefined,
      };
      groups.set(key, g);
    }
    g.count += 1;
    if (!g.centerId) unknownCentres.add(r.centre || "(blank)");
  }
  return { groups: [...groups.values()], unknownCentres };
}

export async function runAdmittedStudents(_prev: AdmittedState, formData: FormData): Promise<AdmittedState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the file to import." };
  if (file.size > MAX_BYTES) return { error: "That file is too large. Split it into smaller files." };
  const academicYear = String(formData.get("academicYear") ?? "");
  if (!/^\d{4}-\d{2}$/.test(academicYear)) return { error: "Choose the academic year." };
  const importNow = formData.get("intent") === "import";

  const parsed = parseAdmittedCsv(await file.text());
  if (parsed.rows.length + parsed.problems.length === 0) return { error: "The file has no students in it." };
  if (parsed.rows.length > MAX_ROWS) return { error: `That is ${parsed.rows.length} students. Import at most ${MAX_ROWS} at a time.` };

  const ctx = await loadContext();
  const { groups, unknownCentres } = plan(parsed.rows, ctx);

  if (!importNow) {
    const alreadyAdmitted: string[] = [];
    for (const r of parsed.rows) {
      const existing = await findLeadByPhone(r.phone);
      if (!existing) continue;
      const [admission] = await db.select({ id: enrolments.id }).from(enrolments).where(and(eq(enrolments.leadId, existing.id), isNull(enrolments.deletedAt)));
      if (admission) alreadyAdmitted.push(r.name);
    }
    return {
      preview: {
        total: parsed.rows.length + parsed.problems.length,
        ready: parsed.rows.length - alreadyAdmitted.length,
        dropped: parsed.rows.filter((r) => r.dropped).length,
        alreadyAdmitted,
        groups,
        courses: ctx.courses.map((c) => ({ value: c.value, label: c.modeLabel ? `${c.label} (${c.modeLabel})` : c.label })),
        batches: ctx.batches.map((b) => ({ id: b.id, label: `${b.name} · ${b.academicYear}`, course: b.course, centerId: b.centerId })),
        unknownCentres: [...unknownCentres],
        problems: parsed.problems,
      },
    };
  }

  const supabase = await createClient();
  let added = 0;
  let attached = 0;
  let dropped = 0;
  const skipped = [...parsed.problems.map((p) => ({ line: p.line, name: p.name, message: p.message }))];

  for (const row of parsed.rows) {
    // What was chosen on the form for this centre and course, falling back to
    // the course that matched on its own.
    const key = groupKey(row.centre, row.course);
    const chosenCourse = formData.has(`course:${key}`)
      ? String(formData.get(`course:${key}`) ?? "")
      : (groups.find((g) => g.key === key)?.matchedCourse ?? "");
    const course = ctx.courses.find((c) => c.value === chosenCourse);
    const chosenBatch = String(formData.get(`batch:${key}`) ?? "");
    const batch = chosenBatch ? ctx.batches.find((b) => b.id === chosenBatch) : undefined;
    let centerId = ctx.centreId(row.centre);
    if (!course) { skipped.push({ line: row.line, name: row.name, message: `Choose the course for ${row.centre} · ${row.course}.` }); continue; }
    if (chosenBatch && (!batch || batch.course !== course.value)) { skipped.push({ line: row.line, name: row.name, message: "That batch is not one of the course's running batches." }); continue; }
    // The batch decides where the student studies and in which year.
    if (batch) centerId = batch.centerId;
    if (!centerId) { skipped.push({ line: row.line, name: row.name, message: `Centre "${row.centre}" is not one of your centres.` }); continue; }
    const match = { course };
    const rowYear = batch?.academicYear ?? academicYear;
    const rowMode = batch?.mode ?? course.mode ?? "hybrid";

    try {
      const joined = new Date(`${row.joinedOn ?? `${rowYear.slice(0, 4)}-06-01`}T12:00:00+05:30`);
      const exams = matchExams(row.examInterest, ctx.exams);
      const resolved = await resolveOrCreateLead({
        studentName: row.name,
        primaryPhone: row.phone,
        email: row.email,
        source: "Past admission",
        centerId,
        city: row.city,
        state: row.state,
        fatherName: row.fatherName,
        examYear: row.examYear,
        interestedExams: exams.values.length ? exams.values : null,
        coursesInterested: [match.course.value],
        receivedAt: joined,
        actorId: user.id,
        suppressArrivalNotice: true,
        historical: true,
      });

      // Profile details the lead was not created with. Only blanks are filled:
      // a lead that was already here keeps whatever it already says.
      const [lead] = await db.select().from(leads).where(eq(leads.id, resolved.leadId));
      const fill = <T,>(current: T | null | undefined, value: T | null): T | undefined => (current === null || current === undefined || current === ("" as unknown as T)) && value !== null ? value : undefined;
      await db
        .update(leads)
        .set({
          ...(resolved.isNewLead ? { createdAt: joined, lastActivityAt: joined } : {}),
          motherName: fill(lead.motherName, row.motherName),
          parentPhone: fill(lead.parentPhone, row.parentPhone),
          whatsappPhone: fill(lead.whatsappPhone, row.phone),
          dob: fill(lead.dob, row.dob),
          addressLine: fill(lead.addressLine, row.addressLine),
          pincode: fill(lead.pincode, row.pincode),
          educationStatus: fill(lead.educationStatus, row.educationStatus),
          schoolCollege: fill(lead.schoolCollege, row.schoolCollege),
          board: fill(lead.board, row.board),
        })
        .where(eq(leads.id, resolved.leadId));

      const note = [row.extras, exams.unmatched.length ? `Exams named in the sheet: ${exams.unmatched.join(", ")}` : null].filter(Boolean).join("\n");

      const done = await db.transaction(async (tx) => {
        const admission = await confirmAdmission(tx, {
          leadId: resolved.leadId,
          course: match.course.value,
          centerId,
          mode: rowMode,
          academicYear: rowYear,
          batchId: batch?.id ?? null,
          totalFeePaiseOverride: 0,
          confirmedBy: user.id,
          enrolledAt: joined,
          historical: true,
        });
        await createStudentFromEnrolment(tx, { enrolmentId: admission.enrolmentId, recordedBy: user.id, joinedAt: joined, onboarded: true });
        if (row.dropped) {
          await dropAdmission(tx, { enrolmentId: admission.enrolmentId, reason: "Dropped — struck out in the admission ledger", droppedBy: user.id });
        }
        if (note) {
          await tx.insert(interactions).values({
            leadId: resolved.leadId,
            type: "note",
            occurredAt: joined,
            notes: `From the student profile sheet:\n${note}`,
            source: "system",
            createdBy: user.id,
          });
        }
        return admission.enrolmentId;
      });

      await writeAuditLog(supabase, {
        actorId: user.id,
        action: "enrolment.admitted_import",
        entityType: "enrolments",
        entityId: done,
        after: { leadId: resolved.leadId, course: match.course.value, batchId: batch?.id ?? null, academicYear: rowYear, joinedOn: row.joinedOn, dropped: row.dropped },
      });
      added += 1;
      if (!resolved.isNewLead) attached += 1;
      if (row.dropped) dropped += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not add this one.";
      skipped.push({ line: row.line, name: row.name, message: /already has an enrolment/.test(msg) ? "Already admitted in the CRM — left as it is." : msg });
    }
  }

  revalidatePath("/accounts");
  revalidatePath("/students");
  skipped.sort((a, b) => a.line - b.line);
  return { result: { added, attached, dropped, skipped } };
}
