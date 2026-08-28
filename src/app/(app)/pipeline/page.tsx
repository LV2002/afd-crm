import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getDropdownOptions } from "@/lib/fields/resolve-field-options";
import { createClient } from "@/lib/supabase/server";
import { formatTerm } from "@/lib/terminology/terms";
import { getTerminologyMap } from "@/lib/terminology/get-terminology";

import { KanbanBoard, type KanbanLead, type KanbanStage } from "./kanban-board";

interface StageRow {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  requires_reason: boolean;
}

interface LeadRow {
  id: string;
  lead_number: number;
  student_name: string;
  primary_phone: string;
  stage_id: string | null;
  temperature: string | null;
  center_id: string | null;
  assigned_to: string | null;
  lost_reason: string | null;
}

export default async function PipelinePage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  const terms = await getTerminologyMap();
  const leadPlural = formatTerm(terms, "lead", "plural");
  const canMove = can(user, "lead.update");

  const supabase = await createClient();

  const [{ data: stageRows }, { data: leadRows }, lostReasonOptions] = await Promise.all([
    supabase
      .from("pipeline_stages")
      .select("id, name, color, sort_order, requires_reason")
      .eq("is_active", true)
      .order("sort_order")
      .returns<StageRow[]>(),
    supabase
      .from("leads")
      .select(
        "id, lead_number, student_name, primary_phone, stage_id, temperature, center_id, assigned_to, lost_reason",
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .returns<LeadRow[]>(),
    getDropdownOptions(supabase, "lost_reason"),
  ]);

  const stages: KanbanStage[] = (stageRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    requiresReason: s.requires_reason,
  }));

  const centerIds = Array.from(new Set((leadRows ?? []).map((l) => l.center_id).filter(Boolean))) as string[];
  const assignedIds = Array.from(new Set((leadRows ?? []).map((l) => l.assigned_to).filter(Boolean))) as string[];

  const [centerNameById, assigneeNameById] = await Promise.all([
    batchNameLookup(supabase, "centers", "name", centerIds),
    batchNameLookup(supabase, "profiles", "full_name", assignedIds),
  ]);

  const lostReasonLabelByValue = new Map(lostReasonOptions.map((o) => [o.value, o.label]));

  const leads: KanbanLead[] = (leadRows ?? []).map((l) => ({
    id: l.id,
    leadNumber: l.lead_number,
    studentName: l.student_name,
    primaryPhone: l.primary_phone,
    stageId: l.stage_id,
    temperature: l.temperature,
    centerName: l.center_id ? (centerNameById.get(l.center_id) ?? null) : null,
    assignedToName: l.assigned_to ? (assigneeNameById.get(l.assigned_to) ?? null) : null,
    lostReasonLabel: l.lost_reason ? (lostReasonLabelByValue.get(l.lost_reason) ?? l.lost_reason) : null,
  }));

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          {leads.length} {leads.length === 1 ? leadPlural.toLowerCase().replace(/s$/, "") : leadPlural.toLowerCase()}
          {" across "}
          {stages.length} stages
        </p>
      </div>

      <KanbanBoard
        stages={stages}
        initialLeads={leads}
        lostReasonOptions={lostReasonOptions}
        canMove={canMove}
      />
    </div>
  );
}

async function batchNameLookup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "centers" | "profiles",
  nameColumn: "name" | "full_name",
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data } = await supabase
    .from(table)
    .select(`id, ${nameColumn}`)
    .in("id", ids)
    .returns<Array<{ id: string } & Record<string, string>>>();

  for (const row of data ?? []) {
    map.set(row.id, row[nameColumn]);
  }
  return map;
}
