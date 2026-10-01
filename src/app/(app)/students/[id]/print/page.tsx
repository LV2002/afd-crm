import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { ProfileSheet } from "@/components/print/profile-sheet";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getBrand } from "@/lib/brand/get-brand";
import { getRawFieldValue } from "@/lib/fields/field-column";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { buildSheetCells, resolveOptionsForPrint } from "@/lib/print/profile-sheet";
import { resolveProfilePhotoUrl } from "@/lib/print/profile-photo";
import { createClient } from "@/lib/supabase/server";

import type { StudentDetailRow } from "../types";

/**
 * The student record printed on AFD's paper sheet.
 *
 * The layout itself lives in components/print/profile-sheet.tsx, shared
 * with the print of a lead's submitted profile form — same physical form,
 * filled in from two different sides, so the two must not drift apart.
 * All this page does is read the student and turn it into cells.
 */
export default async function StudentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "student.read")) return <AccessDenied />;

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: student }, brand, fields] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, lead_id, student_code, full_name, phone, parent_phone, email, dob, status, joined_at, target_exams, target_exam_year, current_course, current_batch_id, center_id, custom, centers(name), batches(name)",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<StudentDetailRow>(),
    getBrand(),
    getFieldSchema(supabase, "student", user),
  ]);

  if (!student) notFound();

  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const options = await resolveOptionsForPrint(supabase, fields);

  function rawValue(key: string): unknown {
    const field = fieldByKey.get(key);
    return field ? getRawFieldValue(field, student as unknown as Record<string, unknown>) : null;
  }

  const cells = buildSheetCells(fields, options, rawValue);

  /**
   * Prefer a real uploaded photo over the pasted-URL field. `photo_url`
   * was the stand-in from before Storage existed and is kept as a
   * fallback so profiles filled in under the old flow still print with a
   * picture. The signed URL is minted here, at render, because the bucket
   * is private — an <img> tag cannot authenticate on its own.
   */
  const photoUrl = can(user, "file.read")
    ? await resolveProfilePhotoUrl(
        supabase,
        // Both sides of Gate 2. A student uploads their photo on the
        // profile form weeks before a `students` row exists, so the file
        // hangs off the LEAD — looking only at the student's own files
        // lost the photo the moment they became a student.
        { studentId: id, leadId: student.lead_id },
        rawValue("photo_url"),
      )
    : null;

  return (
    <ProfileSheet
      brand={brand}
      name={student.full_name}
      photoUrl={photoUrl}
      cells={cells}
    />
  );
}
