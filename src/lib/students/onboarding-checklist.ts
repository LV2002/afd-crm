import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

/** The live checklist for one student, in the order an admin arranged it. */
export async function getStudentChecklist(supabase: SupabaseClient, studentId: string): Promise<ChecklistItem[]> {
  const [{ data: items }, { data: checks }] = await Promise.all([
    supabase
      .from("onboarding_items")
      .select("id, label")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at")
      .returns<Array<{ id: string; label: string }>>(),
    supabase.from("student_onboarding_checks").select("item_id").eq("student_id", studentId).returns<Array<{ item_id: string }>>(),
  ]);
  const done = new Set((checks ?? []).map((c) => c.item_id));
  return (items ?? []).map((i) => ({ id: i.id, label: i.label, checked: done.has(i.id) }));
}

/** Done / total for each student in the queue, for the progress column. */
export async function checklistProgress(
  supabase: SupabaseClient,
  studentIds: string[],
): Promise<{ total: number; done: Map<string, number> }> {
  const { data: items } = await supabase
    .from("onboarding_items")
    .select("id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .returns<Array<{ id: string }>>();
  const active = new Set((items ?? []).map((i) => i.id));
  const done = new Map<string, number>();
  if (studentIds.length > 0 && active.size > 0) {
    const { data: checks } = await supabase
      .from("student_onboarding_checks")
      .select("student_id, item_id")
      .in("student_id", studentIds)
      .returns<Array<{ student_id: string; item_id: string }>>();
    for (const c of checks ?? []) if (active.has(c.item_id)) done.set(c.student_id, (done.get(c.student_id) ?? 0) + 1);
  }
  return { total: active.size, done };
}
