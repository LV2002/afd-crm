import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { startOfDayIST, startOfTomorrowIST } from "@/lib/format/date";

import { buildMyDayQueue, type MyDayLead, type MyDayQueue, type MyDayTask } from "./build-queue";

interface LeadRow {
  id: string;
  lead_number: number;
  student_name: string;
  primary_phone: string;
  temperature: string | null;
  stage_id: string | null;
  center_id: string | null;
  next_followup_at: string | null;
  sla_breached: boolean;
  created_at: string;
}

export interface MyDayQueueResult {
  queue: MyDayQueue;
  stageById: Map<string, { id: string; name: string; stage_type: string }>;
  centerIds: string[];
}

/**
 * The fetch-and-build behind My Day, factored out of the page component so
 * the dashboard's "Your day" widget can show the same counts without
 * duplicating this query. Same "won/lost leads need no more daily
 * attention" filter as the full My Day page.
 */
export async function getMyDayQueueForUser(supabase: SupabaseClient, userId: string): Promise<MyDayQueueResult> {
  const [{ data: stageRows }, { data: leadRows }] = await Promise.all([
    supabase.from("pipeline_stages").select("id, name, stage_type").returns<
      Array<{ id: string; name: string; stage_type: string }>
    >(),
    supabase
      .from("leads")
      .select(
        "id, lead_number, student_name, primary_phone, temperature, stage_id, center_id, next_followup_at, sla_breached, created_at",
      )
      .eq("assigned_to", userId)
      .is("deleted_at", null)
      .returns<LeadRow[]>(),
  ]);

  const stageById = new Map((stageRows ?? []).map((s) => [s.id, s]));
  const activeLeadRows = (leadRows ?? []).filter((row) => {
    const stageType = row.stage_id ? stageById.get(row.stage_id)?.stage_type : undefined;
    return stageType !== "won" && stageType !== "lost";
  });

  const leadIds = activeLeadRows.map((row) => row.id);

  const [{ data: taskRows }, { data: interactionRows }] = await Promise.all([
    leadIds.length > 0
      ? supabase
          .from("tasks")
          .select("id, lead_id, title, due_at")
          .eq("assigned_to", userId)
          .eq("status", "open")
          .is("deleted_at", null)
          .not("due_at", "is", null)
          .in("lead_id", leadIds)
          .returns<Array<{ id: string; lead_id: string; title: string; due_at: string }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; lead_id: string; title: string; due_at: string }> }),
    leadIds.length > 0
      ? supabase.from("interactions").select("lead_id").in("lead_id", leadIds).returns<
          Array<{ lead_id: string }>
        >()
      : Promise.resolve({ data: [] as Array<{ lead_id: string }> }),
  ]);

  const myDayLeads: MyDayLead[] = activeLeadRows.map((row) => ({
    id: row.id,
    leadNumber: row.lead_number,
    studentName: row.student_name,
    primaryPhone: row.primary_phone,
    temperature: row.temperature,
    stageId: row.stage_id,
    centerId: row.center_id,
    nextFollowupAt: row.next_followup_at,
    slaBreached: row.sla_breached,
    createdAt: row.created_at,
  }));

  const openTasks: MyDayTask[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    leadId: t.lead_id,
    title: t.title,
    dueAt: t.due_at,
  }));

  const leadIdsWithInteraction = new Set((interactionRows ?? []).map((r) => r.lead_id));

  const now = new Date();
  const queue = buildMyDayQueue({
    leads: myDayLeads,
    openTasks,
    leadIdsWithInteraction,
    startOfToday: startOfDayIST(now),
    startOfTomorrow: startOfTomorrowIST(now),
  });

  return {
    queue,
    stageById,
    centerIds: Array.from(new Set(activeLeadRows.map((row) => row.center_id).filter(Boolean))) as string[],
  };
}
