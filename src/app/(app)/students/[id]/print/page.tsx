import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import type { StudentDetailRow } from "../types";
import { PrintButton } from "./print-button";

interface OrgRow {
  name: string;
  logo_url: string | null;
}

/**
 * A single printable page — deliberately its own route rather than a modal
 * or a print stylesheet layered onto the detail page, since the detail
 * page has sidebar chrome and interactive controls that don't belong on a
 * physical form. No fee/payment fields, same boundary as the detail page.
 */
export default async function StudentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "student.read")) return <AccessDenied />;

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: student }, { data: org }] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, student_code, full_name, phone, parent_phone, email, dob, status, joined_at, target_exams, target_exam_year, current_course, centers(name), batches(name)",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<StudentDetailRow>(),
    supabase.from("org_settings").select("name, logo_url").maybeSingle<OrgRow>(),
  ]);

  if (!student) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8 print:p-0">
      <PrintButton />

      <div className="flex items-center justify-between border-b-2 border-foreground pb-4">
        <div>
          <h1 className="text-xl font-bold">{org?.name ?? "AFD India"}</h1>
          <p className="text-sm text-muted-foreground">Student Profile</p>
        </div>
        {org?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- a print page has no image optimisation to gain from next/image
          <img src={org.logo_url} alt="" className="h-12 w-auto object-contain" />
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold">{student.full_name}</p>
          <p className="text-sm text-muted-foreground">{student.student_code}</p>
        </div>
        <p className="text-sm text-muted-foreground">Printed {formatDateIST(new Date(), "d MMM yyyy")}</p>
      </div>

      <PrintField label="Phone" value={student.phone} />
      <PrintField label="Parent phone" value={student.parent_phone ?? "—"} />
      <PrintField label="Email" value={student.email ?? "—"} />
      <PrintField label="Date of birth" value={student.dob ? formatDateIST(student.dob, "d MMM yyyy") : "—"} />
      <PrintField label="Centre" value={student.centers?.name ?? "—"} />
      <PrintField label="Course" value={student.current_course ?? "—"} />
      <PrintField label="Batch" value={student.batches?.name ?? "—"} />
      <PrintField label="Target exams" value={student.target_exams?.join(", ") || "—"} />
      <PrintField label="Target exam year" value={student.target_exam_year ?? "—"} />
      <PrintField label="Joined" value={formatDateIST(student.joined_at, "d MMM yyyy")} />

      <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
        <div className="border-t pt-2">Student signature</div>
        <div className="border-t pt-2">Authorised signature</div>
      </div>
    </div>
  );
}

function PrintField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-4 border-b py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
