import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { academicYearOptions, currentAcademicStartYear, formatAcademicYear } from "@/lib/enrolment/academic-year";
import { createClient } from "@/lib/supabase/server";

import { HistoryForm } from "./history-form";

export default async function PastAdmissionsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const { data } = await supabase.from("centers").select("id, name").eq("is_active", true).order("name").returns<Array<{ id: string; name: string }>>();
  // Two years back is the point of this screen, so the list reaches further than the usual picker.
  const start = currentAcademicStartYear();
  const years = [...academicYearOptions(), ...[start - 2, start - 3].map((y) => ({ value: formatAcademicYear(y), label: formatAcademicYear(y) }))]
    .filter((y, i, all) => all.findIndex((o) => o.value === y.value) === i)
    .sort((a, b) => b.value.localeCompare(a.value));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <Link href="/accounts" className="text-sm text-muted-foreground underline">← Admissions</Link>
        <h1 className="text-2xl font-semibold">Add past admissions</h1>
        <p className="text-sm text-muted-foreground">
          For students who joined before the CRM, so the last two years of intake and income can be read in one place. Add the names here; your accountant
          then opens each one under Admissions to enter the fee schedule and every payment with the date it was received. Nobody is messaged, notified or
          chased for money on a past admission, and the payments stay out of the current bank matching.
        </p>
      </div>
      <HistoryForm centers={data ?? []} years={years} />
    </div>
  );
}
