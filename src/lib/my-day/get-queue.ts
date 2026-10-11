import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { startOfDayIST, startOfTomorrowIST } from "@/lib/format/date";
import {
  indexByValue,
  isNoLongerWorked,
  terminalValuesOf,
  type TemperatureOption,
} from "@/lib/leads/temperature-kinds";
import { loadTemperatureOptions } from "@/lib/leads/temperature-options";

import { buildMyDayQueue, type MyDayLead, type MyDayQueue, type MyDayTask } from "./build-queue";

interface LeadRow {
  id: string;
  lead_number: number;
  student_name: string;
  primary_phone: string;
  temperature: string | null;
  center_id: string | null;
  next_followup_at: string | null;
  sla_breached: boolean;
  created_at: string;
}

export interface MyDayQueueResult {
  queue: MyDayQueue;
  /** value → option, so a row can show the label and colour an admin chose. */
  temperatureByValue: Map<string, TemperatureOption>;
  centerIds: string[];
}

/**
 * The fetch-and-build behind My Day, factored out of the page component so
 * the dashboard's "Your day" widget can show the same counts without
 * duplicating this query. Leads that are Took admission or a closing
 * outcome need no more daily attention, and are left out.
 */
export async function getMyDayQueueForUser(supabase: SupabaseClient, userId: string): Promise<MyDayQueueResult> {
  const [temperatureOptions, { data: leadRows }] = await Promise.all([
    loadTemperatureOptions(supabase),
    supabase
      .from("leads")
      .select(
        "id, lead_number, student_name, primary_phone, temperature, center_id, next_followup_at, sla_breached, created_at",
      )
      .eq("assigned_to", userId)
      .is("deleted_at", null)
      .returns<LeadRow[]>(),
  ]);

  const temperatureByValue = indexByValue(temperatureOptions);
  const terminalValues = terminalValuesOf(temperatureOptions);
  const activeLeadRows = (leadRows ?? []).filter(
    (row) => !isNoLongerWorked(row.temperature, terminalValues),
  );

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
    temperatureByValue,
    centerIds: Array.from(new Set(activeLeadRows.map((row) => row.center_id).filter(Boolean))) as string[],
  };
}
