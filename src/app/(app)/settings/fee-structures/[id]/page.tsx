import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getDropdownOptions } from "@/lib/fields/resolve-field-options";
import { createClient } from "@/lib/supabase/server";

import { updateFeeStructure } from "../actions";
import { FeeStructureForm } from "../fee-structure-form";
import { ActiveToggle } from "./active-toggle";

interface FeeStructureRow {
  id: string;
  course: string;
  center_id: string;
  mode: string;
  academic_year: string;
  base_fee_paise: number;
  is_active: boolean;
}

export default async function EditFeeStructurePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: feeStructure }, courses, modes, { data: centerRows }] = await Promise.all([
    supabase
      .from("fee_structures")
      .select("id, course, center_id, mode, academic_year, base_fee_paise, is_active")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<FeeStructureRow>(),
    getDropdownOptions(supabase, "course"),
    getDropdownOptions(supabase, "preferred_mode"),
    supabase.from("centers").select("id, name").order("name").returns<Array<{ id: string; name: string }>>(),
  ]);

  if (!feeStructure) notFound();

  const centers = (centerRows ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{feeStructure.course}</h1>
          <Badge variant={feeStructure.is_active ? "default" : "secondary"}>
            {feeStructure.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <ActiveToggle feeStructureId={feeStructure.id} isActive={feeStructure.is_active} />
      </div>

      <FeeStructureForm
        values={{
          course: feeStructure.course,
          centerId: feeStructure.center_id,
          mode: feeStructure.mode,
          academicYear: feeStructure.academic_year,
          baseFee: String(feeStructure.base_fee_paise / 100),
        }}
        action={updateFeeStructure.bind(null, feeStructure.id)}
        submitLabel="Save changes"
        courses={courses}
        modes={modes}
        centers={centers}
      />
    </div>
  );
}
