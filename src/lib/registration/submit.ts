"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { applyAssignment } from "@/lib/assignment/apply-assignment";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";

import { getPublicForm, type PublicFormField } from "./get-form";

export interface SubmitState {
  error?: string;
  success?: string;
}

/**
 * Core lead columns a public form is allowed to write. Everything else a
 * form asks for goes into `leads.custom`.
 *
 * An allow-list, not a filter on `is_core`: a public, unauthenticated
 * caller must never be able to set `stage_id`, `assigned_to`,
 * `temperature`, `center_id` or any other column that decides ownership or
 * pipeline position, even if an admin mistakenly adds one of those keys to
 * a form's `field_keys`. Those are set by the assignment engine, which is
 * the whole point of routing this through the same path as every other
 * source.
 */
const PUBLIC_CORE_FIELDS: Record<string, string> = {
  father_name: "fatherName",
  mother_name: "motherName",
  alternate_phone: "alternatePhone",
  parent_phone: "parentPhone",
  dob: "dob",
  gender: "gender",
  address_line: "addressLine",
  city: "city",
  district: "district",
  state: "state",
  state_other: "stateOther",
  pincode: "pincode",
  education_status: "educationStatus",
  school_college: "schoolCollege",
  board: "board",
  parents_occupation: "parentsOccupation",
  exam_year: "examYear",
  interested_exams: "interestedExams",
  courses_interested: "coursesInterested",
  preferred_mode: "preferredMode",
};

/** Fields resolveOrCreateLead takes directly rather than via `custom`. */
const IDENTITY_FIELDS = new Set(["student_name", "primary_phone", "email"]);

const submissionSchema = z.object({
  studentName: z.string().trim().min(1, "Please enter your name.").max(200),
  primaryPhone: z
    .string()
    .trim()
    .min(6, "Please enter a valid phone number.")
    .max(20, "Please enter a valid phone number."),
  email: z.string().trim().email("Please enter a valid email address.").max(200).optional().or(z.literal("")),
});

function readValue(field: PublicFormField, formData: FormData): unknown {
  if (field.type === "multiselect") {
    const all = formData.getAll(field.key).filter((v): v is string => typeof v === "string" && v.length > 0);
    return all.length > 0 ? all : null;
  }
  const raw = formData.get(field.key);
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const value = raw.trim();
  if (field.type === "boolean") return value === "on" || value === "true";
  if (field.type === "number" || field.type === "currency") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return value;
}

/**
 * Public form submission. Anonymous by definition, so this deliberately
 * runs on the direct db connection — the same trust boundary as the
 * webhook handlers, and for the same reason: there is no session for RLS
 * to bind to.
 *
 * It creates a lead through `resolveOrCreateLead()` then
 * `applyAssignment()`, exactly like every other source (CLAUDE.md
 * § Non-negotiables 8). This is a new front door, not a second ingestion
 * route — which means a student who already exists is matched to their
 * existing lead and gains an enquiry, rather than becoming a duplicate,
 * and the form never has to decide who owns the lead.
 */
export async function submitRegistration(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const token = formData.get("token");
  if (typeof token !== "string") return { error: "This form link is not valid." };

  // A hidden field a human never sees and never fills. Cheap, and it stops
  // the naive bots that submit every input on a page. It is NOT a rate
  // limit: see docs/DECISIONS.md for what is still missing.
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    // Answer as though it worked. Telling a bot it was detected just
    // invites it to try again without the trap.
    return { success: "Thank you — your details have been received." };
  }

  const lookup = await getPublicForm(token);
  if (lookup.status === "not_found") return { error: "This form link is not valid." };
  if (lookup.status === "closed") return { error: "This form is no longer accepting responses." };
  const form = lookup.form;

  const parsed = submissionSchema.safeParse({
    studentName: formData.get("student_name") ?? "",
    primaryPhone: formData.get("primary_phone") ?? "",
    email: formData.get("email") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details you entered." };
  }

  // Required fields are whatever the admin marked required on this form.
  for (const field of form.fields) {
    if (!field.isRequired) continue;
    const value = readValue(field, formData);
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      return { error: `Please fill in “${field.label}”.` };
    }
  }

  const core: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const field of form.fields) {
    if (IDENTITY_FIELDS.has(field.key)) continue;
    const value = readValue(field, formData);
    if (value === null) continue;
    if (field.isCore) {
      // Silently ignored rather than rejected: an admin adding a
      // non-public core key to a form is a configuration mistake, not the
      // applicant's problem, and the rest of their answers should still
      // be saved.
      if (field.key in PUBLIC_CORE_FIELDS) core[field.key] = value;
    } else {
      custom[field.key] = value;
    }
  }

  const result = await resolveOrCreateLead({
    studentName: parsed.data.studentName,
    primaryPhone: parsed.data.primaryPhone,
    email: parsed.data.email || null,
    source: form.source,
    subSource: form.name,
    centerId: form.centerId,
    raw: { registrationFormId: form.id, core, custom },
    fatherName: typeof core.father_name === "string" ? core.father_name : null,
    city: typeof core.city === "string" ? core.city : null,
    district: typeof core.district === "string" ? core.district : null,
    state: typeof core.state === "string" ? core.state : null,
    examYear: typeof core.exam_year === "string" ? core.exam_year : null,
    interestedExams: Array.isArray(core.interested_exams) ? (core.interested_exams as string[]) : null,
    coursesInterested: Array.isArray(core.courses_interested) ? (core.courses_interested as string[]) : null,
  });

  // Remaining answers are written after the lead exists, and only onto a
  // NEWLY created one. An existing lead's profile belongs to the person
  // and to whoever has been working it — a second form fill must not
  // quietly overwrite a counsellor's corrections. The enquiry row keeps
  // the full submission either way, so nothing the applicant typed is lost.
  if (result.isNewLead) {
    // Field keys are the snake_case column names; Drizzle's `set()` takes
    // the schema's camelCase property names. PUBLIC_CORE_FIELDS is that
    // mapping, and being an explicit allow-list it also guarantees a public
    // submission can only ever reach columns listed there — never
    // stage_id, assigned_to, center_id or temperature.
    const ALREADY_SET = new Set([
      "father_name",
      "city",
      "district",
      "state",
      "exam_year",
      "interested_exams",
      "courses_interested",
    ]);
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(core)) {
      if (ALREADY_SET.has(key)) continue;
      patch[PUBLIC_CORE_FIELDS[key]] = value;
    }
    if (Object.keys(custom).length > 0) patch.custom = custom;

    if (Object.keys(patch).length > 0) {
      await db.update(leads).set(patch).where(eq(leads.id, result.leadId));
    }
  }

  await applyAssignment(db, result.leadId, { trigger: "create" });

  return {
    success: form.successMessage ?? "Thank you — your details have been received. We'll be in touch shortly.",
  };
}
