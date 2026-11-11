import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { academicYearOptions, currentAcademicStartYear, formatAcademicYear } from "@/lib/enrolment/academic-year";

import { StudentsImportForm } from "./students-import-form";

// One row at a time through the same lead, admission and student steps as a
// normal admission: a couple of hundred takes a while.
export const maxDuration = 300;

export default async function ImportAdmittedStudentsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const start = currentAcademicStartYear();
  const years = [...academicYearOptions(), ...[start - 2].map((y) => ({ value: formatAcademicYear(y), label: formatAcademicYear(y) }))]
    .filter((y, i, all) => all.findIndex((o) => o.value === y.value) === i)
    .sort((a, b) => b.value.localeCompare(a.value));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <Link href="/accounts/history" className="text-sm text-muted-foreground underline">← Add past admissions</Link>
        <h1 className="text-2xl font-semibold">Import admitted students from a sheet</h1>
        <p className="text-sm text-muted-foreground">
          Each student becomes a lead, an admission in their course and a student, all dated the day they joined. No fee plan or discount is added, so accounts
          enters those on each admission. Students marked dropped are recorded as dropped. Click <em>Check the file</em> first: it lists each centre and course in
          the file, lets you choose the course and batch every group is joining (matched courses are filled in for you), and writes nothing. Importing the same file again is safe: anyone already admitted is left alone.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Columns: <code>centre, name, phone, email, course, joined_on (yyyy-mm-dd), exam_year, dropped (yes), father_name, mother_name, parent_phone, dob
          (yyyy-mm-dd), address, city, state, pincode, qualification, school, board, exam_interest, extras</code>. Only the first five are needed apart from
          the date.
        </p>
      </div>
      <StudentsImportForm years={years} />
    </div>
  );
}
