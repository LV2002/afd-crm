import Papa from "papaparse";

import { normalizePhone } from "@/lib/identity/normalize-phone";

/**
 * Students who are already admitted, brought in from a sheet: each becomes a
 * lead, an admission in their course and a student, dated the day they
 * joined, with no fee plan or discounts (accounts enters those). This file is
 * the reading and matching; the writes are in the Server Action, so the same
 * rules can be tested without a login.
 */

export interface AdmittedRow {
  line: number;
  centre: string;
  name: string;
  phone: string; // E.164
  email: string | null;
  course: string; // as the sheet writes it
  joinedOn: string | null; // YYYY-MM-DD
  examYear: string | null;
  dropped: boolean;
  fatherName: string | null;
  motherName: string | null;
  parentPhone: string | null;
  dob: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  educationStatus: string | null;
  schoolCollege: string | null;
  board: string | null;
  examInterest: string[];
  /** Everything else worth keeping, as one note on the lead. */
  extras: string | null;
}

export interface AdmittedParse {
  rows: AdmittedRow[];
  /** Rows that cannot be imported as they stand, with why. */
  problems: Array<{ line: number; name: string; message: string }>;
}

const clean = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

function isoDate(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? v : null;
}

export function parseAdmittedCsv(text: string): AdmittedParse {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const rows: AdmittedRow[] = [];
  const problems: AdmittedParse["problems"] = [];
  parsed.data.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const name = clean(r.name);
    if (!name) return void problems.push({ line, name: "(no name)", message: "No name." });
    const phone = normalizePhone(r.phone ?? "");
    if (!phone) return void problems.push({ line, name, message: r.phone ? `"${r.phone}" is not a phone number.` : "No phone number. Add one and import again." });
    const course = clean(r.course);
    if (!course) return void problems.push({ line, name, message: "No course." });
    const joinedOn = isoDate(clean(r.joined_on));
    if (clean(r.joined_on) && !joinedOn) return void problems.push({ line, name, message: `"${r.joined_on}" is not a date (use yyyy-mm-dd).` });
    const parent = clean(r.parent_phone) ? normalizePhone(r.parent_phone) : null;
    rows.push({
      line,
      centre: clean(r.centre) ?? "",
      name,
      phone,
      email: clean(r.email)?.toLowerCase() ?? null,
      course,
      joinedOn,
      examYear: clean(r.exam_year),
      dropped: /^(y|yes|true|dropped|1)$/i.test(clean(r.dropped) ?? ""),
      fatherName: clean(r.father_name),
      motherName: clean(r.mother_name),
      parentPhone: parent,
      dob: isoDate(clean(r.dob)),
      addressLine: clean(r.address),
      city: clean(r.city),
      state: clean(r.state),
      pincode: clean(r.pincode),
      educationStatus: clean(r.qualification),
      schoolCollege: clean(r.school),
      board: clean(r.board),
      examInterest: (clean(r.exam_interest) ?? "").split(/[;,/]/).map((s) => s.trim()).filter(Boolean),
      extras: clean(r.extras),
    });
  });
  return { rows, problems };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface CourseOption {
  value: string;
  label: string;
  /** mode value and label, e.g. hybrid / Hybrid */
  mode: string | null;
  modeLabel: string | null;
}

export type CourseMatch = { kind: "ok"; course: CourseOption } | { kind: "none" } | { kind: "ambiguous"; options: string[] };

/**
 * Finds the CRM course a sheet's course name means.
 *
 * "Design Regular - Hybrid" can be one course called exactly that, or a
 * course "Design Regular" whose mode is Hybrid; both are recognised. A name
 * that fits nothing, or fits several, is reported rather than guessed, so
 * nobody lands in the wrong course.
 */
export function matchCourse(sheetCourse: string, courses: readonly CourseOption[]): CourseMatch {
  const whole = norm(sheetCourse);
  const parts = sheetCourse.split(/\s[-–—]\s/);
  const base = norm(parts[0] ?? "");
  const modePart = parts.length > 1 ? norm(parts[parts.length - 1]) : null;

  const exact = courses.filter((c) => norm(c.label) === whole || norm(c.value) === whole || (c.modeLabel && norm(`${c.label}${c.modeLabel}`) === whole));
  if (exact.length === 1) return { kind: "ok", course: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous", options: exact.map((c) => c.label) };

  if (modePart) {
    const byBase = courses.filter(
      (c) => (norm(c.label) === base || norm(c.value) === base) && (norm(c.mode ?? "") === modePart || norm(c.modeLabel ?? "") === modePart),
    );
    if (byBase.length === 1) return { kind: "ok", course: byBase[0] };
    if (byBase.length > 1) return { kind: "ambiguous", options: byBase.map((c) => c.label) };
  }
  return { kind: "none" };
}

/** Matches an exam the sheet names to the exam options, best effort; the rest stays in the note. */
export function matchExams(names: readonly string[], exams: ReadonlyArray<{ value: string; label: string }>): { values: string[]; unmatched: string[] } {
  const values: string[] = [];
  const unmatched: string[] = [];
  for (const n of names) {
    const hit = exams.find((e) => norm(e.label) === norm(n) || norm(e.value) === norm(n));
    if (hit) values.push(hit.value);
    else unmatched.push(n);
  }
  return { values: [...new Set(values)], unmatched };
}
