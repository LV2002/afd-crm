"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { parseRupeesToPaise } from "@/lib/format/currency";
import { createClient } from "@/lib/supabase/server";

export interface FeeStructureFormState {
  error?: string;
  success?: string;
}

const feeStructureSchema = z.object({
  course: z.string().trim().min(1, "Course is required"),
  centerId: z.string().uuid("Centre is required"),
  mode: z.string().trim().min(1, "Mode is required"),
  academicYear: z.string().trim().min(1, "Academic year is required"),
});

function parseInput(formData: FormData) {
  const parsed = feeStructureSchema.safeParse({
    course: formData.get("course"),
    centerId: formData.get("centerId"),
    mode: formData.get("mode"),
    academicYear: formData.get("academicYear"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." } as const;
  }
  const baseFeePaise = parseRupeesToPaise(formData.get("baseFee"));
  if (baseFeePaise === null || baseFeePaise <= 0) {
    return { error: "Enter a valid base fee." } as const;
  }
  return { data: { ...parsed.data, baseFeePaise } } as const;
}

export async function createFeeStructure(
  _prevState: FeeStructureFormState,
  formData: FormData,
): Promise<FeeStructureFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const result = parseInput(formData);
  if ("error" in result) return { error: result.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fee_structures")
    .insert({
      course: result.data.course,
      center_id: result.data.centerId,
      mode: result.data.mode,
      academic_year: result.data.academicYear,
      base_fee_paise: result.data.baseFeePaise,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "fee_structure.create",
    entityType: "fee_structures",
    entityId: data.id,
    after: result.data,
  });

  revalidatePath("/settings/fee-structures");
  redirect(`/settings/fee-structures/${data.id}`);
}

export async function updateFeeStructure(
  feeStructureId: string,
  _prevState: FeeStructureFormState,
  formData: FormData,
): Promise<FeeStructureFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const result = parseInput(formData);
  if ("error" in result) return { error: result.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fee_structures")
    .update({
      course: result.data.course,
      center_id: result.data.centerId,
      mode: result.data.mode,
      academic_year: result.data.academicYear,
      base_fee_paise: result.data.baseFeePaise,
    })
    .eq("id", feeStructureId);

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "fee_structure.update",
    entityType: "fee_structures",
    entityId: feeStructureId,
    after: result.data,
  });

  revalidatePath("/settings/fee-structures");
  revalidatePath(`/settings/fee-structures/${feeStructureId}`);
  return { success: "Saved." };
}

export async function setFeeStructureActive(feeStructureId: string, isActive: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("fee_structures").update({ is_active: isActive }).eq("id", feeStructureId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: isActive ? "fee_structure.activate" : "fee_structure.deactivate",
    entityType: "fee_structures",
    entityId: feeStructureId,
  });

  revalidatePath("/settings/fee-structures");
  revalidatePath(`/settings/fee-structures/${feeStructureId}`);
}
