import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LayoutRow } from "@/lib/dashboard/resolve-layout";

/**
 * One role's saved arrangement. Empty means "never arranged", which the
 * resolver reads as "everything their permissions allow" — not as an
 * empty dashboard.
 */
export async function getRoleLayout(
  supabase: SupabaseClient,
  roleId: string,
): Promise<LayoutRow[]> {
  const { data } = await supabase
    .from("dashboard_layouts")
    .select("widget_key, sort_order, is_visible")
    .eq("role_id", roleId)
    .order("sort_order")
    .returns<Array<{ widget_key: string; sort_order: number; is_visible: boolean }>>();

  return (data ?? []).map((row) => ({
    widgetKey: row.widget_key,
    sortOrder: row.sort_order,
    isVisible: row.is_visible,
  }));
}
