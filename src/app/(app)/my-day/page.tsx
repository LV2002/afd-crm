import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { batchNameLookup } from "@/lib/leads/batch-name-lookup";
import { maskPhone } from "@/lib/leads/mask-phone";
import { getMyDayQueueForUser } from "@/lib/my-day/get-queue";
import type { MyDayItem, MyDayReason } from "@/lib/my-day/build-queue";
import { createClient } from "@/lib/supabase/server";
import { formatTerm } from "@/lib/terminology/terms";
import { getTerminologyMap } from "@/lib/terminology/get-terminology";

import { RevealPhoneButton } from "../leads/reveal-phone-button";

export default async function MyDayPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  const terms = await getTerminologyMap();
  const leadSingular = formatTerm(terms, "lead", "singular").toLowerCase();
  const leadPlural = formatTerm(terms, "lead", "plural").toLowerCase();
  const canRevealPhone = can(user, "lead.reveal_phone");

  const supabase = await createClient();

  const { queue, stageById, centerIds } = await getMyDayQueueForUser(supabase, user.id);
  const centerNameById = await batchNameLookup(supabase, "centers", "name", centerIds);

  const totalCount =
    queue.overdue.length + queue.dueToday.length + queue.newAssignments.length + queue.atRisk.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">My Day</h1>
        <p className="text-sm text-muted-foreground">
          {totalCount === 0
            ? `Nothing needs attention right now — every ${leadSingular} assigned to you is on track.`
            : `${totalCount} ${totalCount === 1 ? leadSingular : leadPlural} need attention today, in order.`}
        </p>
      </div>

      <QueueSection
        title="Overdue"
        description="Past their follow-up or task due date."
        items={queue.overdue}
        stageById={stageById}
        centerNameById={centerNameById}
        canRevealPhone={canRevealPhone}
        emptyMessage="Nothing overdue."
      />
      <QueueSection
        title="Due today"
        description="Follow up before the day is out."
        items={queue.dueToday}
        stageById={stageById}
        centerNameById={centerNameById}
        canRevealPhone={canRevealPhone}
        emptyMessage="Nothing due today."
      />
      <QueueSection
        title="New assignments"
        description={`${leadPlural[0].toUpperCase()}${leadPlural.slice(1)} you haven't contacted yet.`}
        items={queue.newAssignments}
        stageById={stageById}
        centerNameById={centerNameById}
        canRevealPhone={canRevealPhone}
        emptyMessage="No new, uncontacted assignments."
      />
      <QueueSection
        title="At risk"
        description="Hot with no next step planned, or an SLA breach."
        items={queue.atRisk}
        stageById={stageById}
        centerNameById={centerNameById}
        canRevealPhone={canRevealPhone}
        emptyMessage="Nothing at risk."
      />
    </div>
  );
}

function QueueSection({
  title,
  description,
  items,
  stageById,
  centerNameById,
  canRevealPhone,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: MyDayItem[];
  stageById: Map<string, { id: string; name: string; stage_type: string }>;
  centerNameById: Map<string, string>;
  canRevealPhone: boolean;
  emptyMessage: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        <Badge variant="secondary">{items.length}</Badge>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">{description}</p>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {items.map((item) => (
            <MyDayRow
              key={item.lead.id}
              item={item}
              stageName={item.lead.stageId ? stageById.get(item.lead.stageId)?.name : undefined}
              centerName={item.lead.centerId ? centerNameById.get(item.lead.centerId) : undefined}
              canRevealPhone={canRevealPhone}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MyDayRow({
  item,
  stageName,
  centerName,
  canRevealPhone,
}: {
  item: MyDayItem;
  stageName?: string;
  centerName?: string;
  canRevealPhone: boolean;
}) {
  const { lead, reason } = item;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
            {lead.studentName}
          </Link>
          {lead.temperature && (
            <Badge variant="outline" className="text-xs">
              {lead.temperature}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {[stageName, centerName].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <RevealPhoneButton
          leadId={lead.id}
          masked={maskPhone(lead.primaryPhone)}
          canReveal={canRevealPhone}
        />
        <p className="text-sm text-muted-foreground">{describeReason(reason)}</p>
      </div>
    </div>
  );
}

function describeReason(reason: MyDayReason): string {
  switch (reason.kind) {
    case "task_overdue":
      return `Task overdue: "${reason.taskTitle}" (was due ${formatDateIST(reason.dueAt, "d MMM")})`;
    case "task_due_today":
      return `Task due today: "${reason.taskTitle}"`;
    case "followup_overdue":
      return `Follow-up overdue since ${formatDateIST(reason.dueAt, "d MMM")}`;
    case "followup_due_today":
      return `Follow-up due today at ${formatDateIST(reason.dueAt, "h:mm a")}`;
    case "new_assignment":
      return "New — not yet contacted";
    case "at_risk_sla":
      return "SLA breached";
    case "at_risk_stalled":
      return "Hot lead, no next step scheduled";
  }
}
