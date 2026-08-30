import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getDropdownOptions } from "@/lib/fields/resolve-field-options";
import { createClient } from "@/lib/supabase/server";

import { createFeeStructure } from "../actions";
import { FeeStructureForm } from "../fee-structure-form";

export default async function NewFeeStructurePage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const [courses, modes, { data: centerRows }] = await Promise.all([
    getDropdownOptions(supabase, "course"),
    getDropdownOptions(supabase, "preferred_mode"),
    supabase.from("centers").select("id, name").eq("is_active", true).order("name").returns<
      Array<{ id: string; name: string }>
    >(),
  ]);
  const centers = (centerRows ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">New fee structure</h1>
      <FeeStructureForm
        values={{ course: "", centerId: "", mode: "", academicYear: "", baseFee: "" }}
        action={createFeeStructure}
        submitLabel="Create fee structure"
        courses={courses}
        modes={modes}
        centers={centers}
      />
    </div>
  );
}
