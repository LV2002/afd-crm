import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";

import { AttachmentsPanel } from "@/components/files/attachments-panel";
import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can, getCurrentUser } from "@/lib/auth/session";
import { groupBySection } from "@/lib/fields/group-by-section";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { OPTION_BEARING_TYPES, resolveFieldOptions, type FieldOption } from "@/lib/fields/resolve-field-options";
import { formatDateIST } from "@/lib/format/date";
import { listAttachments } from "@/lib/storage/attachments";
import { createClient } from "@/lib/supabase/server";

import { StudentEditForm } from "./student-edit-form";
import type { StudentDetailRow } from "./types";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "student.read")) return <AccessDenied />;

  const { id } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select(
      "id, student_code, full_name, phone, parent_phone, email, dob, status, joined_at, target_exams, target_exam_year, current_course, current_batch_id, center_id, custom, centers(name), batches(name)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<StudentDetailRow>();

  if (!student) notFound();

  const canEdit = can(user, "student.update");
  const canReadFiles = can(user, "file.read");

  const fields = await getFieldSchema(supabase, "student", user);
  const attachments = canReadFiles ? await listAttachments(supabase, { kind: "student", id }) : [];
  const sections = groupBySection(fields);

  const values: Record<string, unknown> = {};
  for (const field of fields) {
    values[field.key] = field.isCore
      ? (student as unknown as Record<string, unknown>)[field.key]
      : (student.custom ?? {})[field.key];
  }

  const optionsByKey: Record<string, FieldOption[]> = {};
  for (const field of fields) {
    if (OPTION_BEARING_TYPES.has(field.type)) {
      optionsByKey[field.key] = await resolveFieldOptions(supabase, field);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{student.full_name}</h1>
          <p className="text-sm text-muted-foreground">{student.student_code}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={student.status === "active" ? "default" : "secondary"}>{student.status}</Badge>
          {student.centers?.name && <Badge variant="outline">{student.centers.name}</Badge>}
          <Button asChild size="sm" variant="outline">
            <Link href={`/students/${id}/print`}>
              <Printer /> Print profile
            </Link>
          </Button>
        </div>
      </div>

      {/*
        No fee/payment data anywhere on this page or its query above —
        that's the boundary CLAUDE.md draws between accounts and
        academics, enforced twice over: `payment.read`'s RLS policy
        wouldn't grant academics a payments row anyway, and this page
        never asks for one. Every OTHER field on the real intake form
        (docs/PROGRESS.md, Session 24) is driven entirely by
        field_definitions(entity='student') — an admin adding a new
        question to the form needs a Settings screen, not a code change.
      */}
      {canEdit ? (
        <StudentEditForm studentId={id} sections={sections} values={values} optionsByKey={optionsByKey} />
      ) : (
        <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3">
          {fields.map((field) => (
            <div key={field.id} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{field.label}</span>
              <span className="text-sm font-medium">{formatFieldValue(field.key, values[field.key])}</span>
            </div>
          ))}
        </div>
      )}

      {canReadFiles && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Files</h2>
          <AttachmentsPanel
            parentKind="student"
            parentId={id}
            attachments={attachments}
            canUpload={can(user, "file.upload")}
            canDelete={can(user, "file.delete")}
            labelSuggestions={["Photo", "ID proof", "Marksheet", "Portfolio", "Certificate"]}
          />
        </div>
      )}
    </div>
  );
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (key === "dob" || key === "joined_at") return formatDateIST(value as string, "d MMM yyyy");
  return String(value);
}
