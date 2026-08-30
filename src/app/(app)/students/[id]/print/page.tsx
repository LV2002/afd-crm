import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getFieldSchema, type FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import { getRawFieldValue } from "@/lib/fields/field-column";
import { formatDateIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import type { StudentDetailRow } from "../types";
import { PrintButton } from "./print-button";

interface OrgRow {
  name: string;
  logo_url: string | null;
}

/**
 * Field-for-field reproduction of AFD's real paper intake form (the PDF
 * Leon shared — docs/PROGRESS.md, Session 24), NOT the earlier
 * placeholder layout. Every value comes off `field_definitions` (core
 * column or `students.custom`), so an admin renaming a label in Settings
 * changes what prints too — but the PAIRING/ORDER below is fixed to match
 * the physical form exactly, independent of whatever section order the
 * edit form's tabs use (see student-edit-form.tsx) — two different
 * orderings for two different purposes, both legitimate. If Leon adds a
 * genuinely new question to the intake form later, it needs a row added
 * here too; that's the one part of this page that isn't config-driven,
 * because a fixed paper form's layout is a real, one-time design
 * decision, not admin-configurable data.
 */
const PRINT_ROWS: Array<[string, string | null]> = [
  ["program", "current_batch_id"],
  ["dob", "mode"],
  ["city", "address"],
  ["pincode", "state"],
  ["email", "phone"],
  ["mother_name", "mother_phone"],
  ["father_name", "father_phone"],
  ["current_qualification", "design_discipline_interested"],
  ["target_exams", "last_school_attended"],
  ["art_teacher_name", "art_teacher_phone"],
  ["stream_11_12", "exam_board"],
  ["percentage_12th", "percentage_10th"],
  ["hobbies", "joined_at"],
];

const BADGE_KEYS = new Set(["program", "current_batch_id", "mode"]);

export default async function StudentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "student.read")) return <AccessDenied />;

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: student }, { data: org }, fields] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, student_code, full_name, phone, parent_phone, email, dob, status, joined_at, target_exams, target_exam_year, current_course, current_batch_id, center_id, custom, centers(name), batches(name)",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<StudentDetailRow>(),
    supabase.from("org_settings").select("name, logo_url").maybeSingle<OrgRow>(),
    getFieldSchema(supabase, "student", user),
  ]);

  if (!student) notFound();

  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const optionsByKey = await resolveOptionsForPrint(supabase, fields);

  function rawValue(key: string): unknown {
    const field = fieldByKey.get(key);
    return field ? getRawFieldValue(field, student as unknown as Record<string, unknown>) : null;
  }

  function cell(key: string | null) {
    if (!key) return null;
    const field = fieldByKey.get(key);
    if (!field) return null;
    return { field, display: formatPrintValue(field, rawValue(key), optionsByKey.get(key) ?? []) };
  }

  const photoUrl = rawValue("photo_url");

  return (
    <div className="relative mx-auto max-w-3xl p-8 print:p-0">
      <PrintButton />

      {/*
        Positioned outside the table's own column grid rather than as a
        rowSpan/colSpan cell inside it — a rowSpan cell would force every
        OTHER row in the table to also account for that extra column
        (either matching its width or leaving a visible gap), for a photo
        that only actually occupies the first two rows. Overlaying it is
        simpler and doesn't distort the rest of the table's 4-column grid.
      */}
      <div className="absolute right-8 top-24 print:right-0 print:top-20">
        <PhotoBox url={typeof photoUrl === "string" && photoUrl ? photoUrl : null} />
      </div>

      <table className="w-full border-collapse border border-foreground text-sm">
        <tbody>
          <tr>
            <td colSpan={4} className="border border-foreground p-3 text-center">
              <span className="text-lg font-bold">{org?.name ?? "AFD India"}</span>
              {org?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element -- a print page has no image optimisation to gain from next/image
                <img src={org.logo_url} alt="" className="mx-auto mt-1 h-8 w-auto object-contain" />
              )}
            </td>
          </tr>

          <tr>
            <PrintLabel>Name</PrintLabel>
            <PrintValue colSpan={3}>{student.full_name}</PrintValue>
          </tr>

          {PRINT_ROWS.map(([leftKey, rightKey]) => {
            const left = cell(leftKey);
            const right = cell(rightKey);
            return (
              <tr key={leftKey}>
                <PrintLabel>{left?.field.label ?? leftKey}</PrintLabel>
                <PrintValue badge={BADGE_KEYS.has(leftKey)}>{left?.display ?? "—"}</PrintValue>
                <PrintLabel>{right?.field.label ?? rightKey}</PrintLabel>
                <PrintValue badge={rightKey ? BADGE_KEYS.has(rightKey) : false}>{right?.display ?? "—"}</PrintValue>
              </tr>
            );
          })}

          <tr>
            <td colSpan={4} className="border border-foreground p-2 align-top">
              <p className="mb-1 font-semibold">Comments:</p>
              <p className="min-h-16">{cell("comments")?.display ?? ""}</p>
            </td>
          </tr>

          <tr>
            <td colSpan={2} className="border border-foreground p-2">
              &nbsp;
            </td>
            <td colSpan={2} className="border border-foreground p-2 text-right font-semibold">
              Signature:
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PrintLabel({ children }: { children: React.ReactNode }) {
  return <td className="w-1/6 border border-foreground bg-muted p-2 font-semibold">{children}</td>;
}

function PrintValue({ children, colSpan, badge }: { children: React.ReactNode; colSpan?: number; badge?: boolean }) {
  return (
    <td className="border border-foreground p-2" colSpan={colSpan}>
      {badge ? <span className="inline-block rounded bg-muted px-2 py-0.5">{children}</span> : children}
    </td>
  );
}

function PhotoBox({ url }: { url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- a print page has no image optimisation to gain from next/image
    return <img src={url} alt="" className="h-24 w-20 object-cover" />;
  }
  return <div className="h-24 w-20 border border-dashed border-muted-foreground" />;
}

async function resolveOptionsForPrint(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fields: FieldSchemaEntry[],
): Promise<Map<string, Array<{ value: string; label: string }>>> {
  const { OPTION_BEARING_TYPES, resolveFieldOptions } = await import("@/lib/fields/resolve-field-options");
  const map = new Map<string, Array<{ value: string; label: string }>>();
  for (const field of fields) {
    if (OPTION_BEARING_TYPES.has(field.type)) {
      map.set(field.key, await resolveFieldOptions(supabase, field));
    }
  }
  return map;
}

function formatPrintValue(field: FieldSchemaEntry, raw: unknown, options: Array<{ value: string; label: string }>): string {
  if (raw === null || raw === undefined || raw === "") return "—";

  if (field.type === "multiselect" && Array.isArray(raw)) {
    const byValue = new Map(options.map((o) => [o.value, o.label]));
    return raw.map((v) => byValue.get(String(v)) ?? String(v)).join(", ") || "—";
  }
  if ((field.type === "select" || field.type === "user_ref") && options.length > 0) {
    return options.find((o) => o.value === String(raw))?.label ?? String(raw);
  }
  if (field.type === "date" || field.type === "datetime") {
    return formatDateIST(raw as string, "d MMM yyyy");
  }
  if (field.type === "number" && (field.key === "percentage_10th" || field.key === "percentage_12th")) {
    return `${raw}%`;
  }
  return String(raw);
}
