import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startOfMonthIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import { StatTile } from "./stat-tile";

interface LeadRow {
  id: string;
  stage_id: string | null;
  assigned_to: string | null;
  sla_breached: boolean;
}

/**
 * Runs through the RLS-bound client — no manual center filtering needed,
 * `leads`/`enrolments`' own RLS already restricts these rows to exactly
 * what the caller's `lead.read`/`enrolment.read` scope permits (center for
 * a centre head, all for admin/co_admin holding the same bundle).
 */
export async function CentreWidget() {
  const supabase = await createClient();
  const monthStart = startOfMonthIST(new Date()).toISOString();

  const [{ data: stageRows }, { data: leadRows }, { count: admissionsThisMonth }] = await Promise.all([
    supabase.from("pipeline_stages").select("id, stage_type").returns<Array<{ id: string; stage_type: string }>>(),
    supabase
      .from("leads")
      .select("id, stage_id, assigned_to, sla_breached")
      .is("deleted_at", null)
      .returns<LeadRow[]>(),
    supabase
      .from("enrolments")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("sales_to_accounts_at", monthStart),
  ]);

  const terminalStageIds = new Set(
    (stageRows ?? []).filter((s) => s.stage_type === "won" || s.stage_type === "lost").map((s) => s.id),
  );
  const activeLeads = (leadRows ?? []).filter((row) => !row.stage_id || !terminalStageIds.has(row.stage_id));
  const unassigned = activeLeads.filter((row) => !row.assigned_to).length;
  const breached = activeLeads.filter((row) => row.sla_breached).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>Active leads at your centre(s).</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Active leads" value={activeLeads.length} />
          <StatTile label="Unassigned" value={unassigned} />
          <StatTile label="SLA breached" value={breached} />
          <StatTile label="Admissions this month" value={admissionsThisMonth ?? 0} />
        </div>
        <div className="flex gap-4">
          <Link href="/leads" className="text-sm font-medium hover:underline">
            View leads →
          </Link>
          {unassigned > 0 && (
            <Link href="/leads/orphans" className="text-sm font-medium hover:underline">
              Orphan queue →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
