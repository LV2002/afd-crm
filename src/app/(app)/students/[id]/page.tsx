import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import type { StudentDetailRow } from "./types";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "student.read")) return <AccessDenied />;

  const { id } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select(
      "id, student_code, full_name, phone, parent_phone, email, dob, status, joined_at, target_exams, target_exam_year, current_course, centers(name), batches(name)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<StudentDetailRow>();

  if (!student) notFound();

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
        never asks for one.
      */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <Field label="Phone">{student.phone}</Field>
        <Field label="Parent phone">{student.parent_phone ?? "—"}</Field>
        <Field label="Email">{student.email ?? "—"}</Field>
        <Field label="Date of birth">{student.dob ? formatDateIST(student.dob, "d MMM yyyy") : "—"}</Field>
        <Field label="Course">{student.current_course ?? "—"}</Field>
        <Field label="Batch">{student.batches?.name ?? "—"}</Field>
        <Field label="Target exams">{student.target_exams?.join(", ") || "—"}</Field>
        <Field label="Target exam year">{student.target_exam_year ?? "—"}</Field>
        <Field label="Joined">{formatDateIST(student.joined_at, "d MMM yyyy")}</Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}
