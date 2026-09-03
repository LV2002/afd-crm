import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { ProfileSheet } from "@/components/print/profile-sheet";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getRawFieldValue } from "@/lib/fields/field-column";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { buildSheetCells, resolveOptionsForPrint } from "@/lib/print/profile-sheet";
import { createSignedUrl, listAttachments } from "@/lib/storage/attachments";
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
interface OrgRow {
  name: string;
  logo_url: string | null;
}

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
  const pastedPhotoUrl = rawValue("photo_url");
  const uploadedPhoto = can(user, "file.read")
    ? (await listAttachments(supabase, { kind: "student", id })).find(
        (a) => a.mime_type.startsWith("image/") && (a.label ?? "").toLowerCase().includes("photo"),
      )
    : undefined;
  const signedPhotoUrl = uploadedPhoto
    ? await createSignedUrl(supabase, uploadedPhoto.storage_path)
    : null;
  const photoUrl =
    signedPhotoUrl ?? (typeof pastedPhotoUrl === "string" && pastedPhotoUrl ? pastedPhotoUrl : null);

  return (
    <ProfileSheet
      orgName={org?.name ?? "AFD India"}
      logoUrl={org?.logo_url ?? null}
      name={student.full_name}
      photoUrl={photoUrl}
      cells={cells}
    />
  );
}
