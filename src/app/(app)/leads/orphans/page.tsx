import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { batchNameLookup } from "@/lib/leads/batch-name-lookup";
import { maskPhone } from "@/lib/leads/mask-phone";
import { createClient } from "@/lib/supabase/server";

import { OrphanRow, type OrphanLeadData } from "./orphan-row";

interface StageRow {
  id: string;
  stage_type: string;
}

/**
 * docs/02-BUILD-PHASES.md § Phase 2: "Orphan queue for centre heads" —
 * every lead the assignment engine matched no active rule for
 * (CLAUDE.md non-negotiable #4: a lead that matches nothing is left
 * exactly as it was, not force-assigned to a default) sits here until a
 * human claims it. Gated on `lead.assign`, currently held only by
 * center_head (and admin/co_admin via their blanket grant) — see
 * seed.ts.
 */
export default async function OrphansPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.assign")) return <AccessDenied />;

  const supabase = await createClient();

  const [{ data: stageRows }, { data: leadRows }] = await Promise.all([
    supabase.from("pipeline_stages").select("id, stage_type").returns<StageRow[]>(),
    supabase
      .from("leads")
      .select("id, student_name, primary_phone, first_touch_source, center_id, stage_id, created_at")
      .is("assigned_to", null)
      .is("deleted_at", null)
      .order("created_at")
      .returns<Array<OrphanLeadData & { stage_id: string | null }>>(),
  ]);

  const terminalStageIds = new Set(
    (stageRows ?? []).filter((s) => s.stage_type === "won" || s.stage_type === "lost").map((s) => s.id),
  );
  const orphans = (leadRows ?? []).filter((row) => !row.stage_id || !terminalStageIds.has(row.stage_id));

  const centerIds = Array.from(new Set(orphans.map((row) => row.center_id).filter(Boolean))) as string[];

  const [centerNameById, assignableByCenterId] = await Promise.all([
    batchNameLookup(supabase, "centers", "name", centerIds),
    resolveAssignableByCenterId(supabase, centerIds),
  ]);

  const canRevealPhone = can(user, "lead.reveal_phone");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Orphan queue</h1>
        <p className="text-sm text-muted-foreground">
          Leads no assignment rule matched — nobody owns these yet.
        </p>
      </div>

      {orphans.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing unassigned right now.
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {orphans.map((lead) => {
            const assignableUsers = (lead.center_id && assignableByCenterId.get(lead.center_id)) || [];
            return (
              <OrphanRow
                key={lead.id}
                lead={lead}
                maskedPhone={maskPhone(lead.primary_phone)}
                canRevealPhone={canRevealPhone}
                centerName={lead.center_id ? centerNameById.get(lead.center_id) : undefined}
                createdAtLabel={formatDateIST(lead.created_at, "d MMM yyyy")}
                assignableUsers={assignableUsers}
                currentUserId={assignableUsers.some((u) => u.id === user.id) ? user.id : null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

async function resolveAssignableByCenterId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  centerIds: string[],
): Promise<Map<string, Array<{ id: string; fullName: string }>>> {
  const map = new Map<string, Array<{ id: string; fullName: string }>>();
  if (centerIds.length === 0) return map;

  const { data: memberships } = await supabase
    .from("user_centers")
    .select("user_id, center_id")
    .in("center_id", centerIds)
    .returns<Array<{ user_id: string; center_id: string }>>();

  const userIds = Array.from(new Set((memberships ?? []).map((m) => m.user_id)));
  if (userIds.length === 0) return map;

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .in("id", userIds)
    .order("full_name")
    .returns<Array<{ id: string; full_name: string }>>();

  const nameById = new Map((profileRows ?? []).map((p) => [p.id, p.full_name]));

  for (const membership of memberships ?? []) {
    const fullName = nameById.get(membership.user_id);
    if (!fullName) continue; // inactive, or not visible under RLS
    const list = map.get(membership.center_id) ?? [];
    list.push({ id: membership.user_id, fullName });
    map.set(membership.center_id, list);
  }
  return map;
}
