import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MyDayItem, MyDayQueue, MyDayReason } from "@/lib/my-day/build-queue";
import { formatDateIST } from "@/lib/format/date";
import { maskPhone } from "@/lib/leads/mask-phone";
import { getMyDayQueueForUser } from "@/lib/my-day/get-queue";
import { batchNameLookup } from "@/lib/leads/batch-name-lookup";
import { createClient } from "@/lib/supabase/server";

import { RevealPhoneButton } from "../leads/reveal-phone-button";

/**
 * The work queue itself, on the dashboard.
 *
 * This used to be four numbers with a link to `/my-day`. Leon asked for the
 * two screens to be one, and the honest reading of that is not "put the
 * counts next to the other counts" — it is that the queue *is* the
 * counsellor's screen, so it belongs here in full, and the separate page
 * goes away.
 *
 * Only the first few of each bucket are drawn. A counsellor with sixty
 * overdue leads does not need sixty rows on a landing page; they need to
 * see that it is sixty and get to the list. Each section links through to
 * `/leads` with the filter already applied.
 */

/** Enough to act on without turning the landing page into a list view. */
const PREVIEW_ROWS = 5;

export async function MyDayWidget({
  userId,
  canRevealPhone,
}: {
  userId: string;
  canRevealPhone: boolean;
}) {
  const supabase = await createClient();
  const { queue, stageById, centerIds } = await getMyDayQueueForUser(supabase, userId);
  const centerNameById = await batchNameLookup(supabase, "centers", "name", centerIds);

  const total =
    queue.overdue.length +
    queue.dueToday.length +
    queue.newAssignments.length +
    queue.atRisk.length;

  const sections: Array<{ title: string; hint: string; items: MyDayItem[] }> = [
    { title: "Overdue", hint: "Past their follow-up or task date", items: queue.overdue },
    { title: "Due today", hint: "Before the day is out", items: queue.dueToday },
    { title: "New", hint: "Not contacted yet", items: queue.newAssignments },
    { title: "At risk", hint: "Hot with no next step, or an SLA breach", items: queue.atRisk },
  ];

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Your day</CardTitle>
        <CardDescription>
          {total === 0
            ? "Nothing needs attention right now — everything assigned to you is on track."
            : `${total} lead${total === 1 ? "" : "s"} need attention, most urgent first.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {total === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            A clear queue. Worth glancing at your numbers above to see what is coming.
          </p>
        ) : null}

        {sections
          .filter((section) => section.items.length > 0)
          .map((section) => (
            <section key={section.title} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="font-medium">{section.title}</h3>
                <Badge variant="secondary">{section.items.length}</Badge>
                <span className="text-xs text-muted-foreground">{section.hint}</span>
              </div>

              <div className="flex flex-col divide-y rounded-lg border">
                {section.items.slice(0, PREVIEW_ROWS).map((item) => (
                  <QueueRow
                    key={item.lead.id}
                    item={item}
                    stageName={item.lead.stageId ? stageById.get(item.lead.stageId)?.name : undefined}
                    centerName={item.lead.centerId ? centerNameById.get(item.lead.centerId) : undefined}
                    canRevealPhone={canRevealPhone}
                  />
                ))}
              </div>

              {section.items.length > PREVIEW_ROWS ? (
                <Link href="/leads?mine=1" className="text-sm font-medium hover:underline">
                  {section.items.length - PREVIEW_ROWS} more →
                </Link>
              ) : null}
            </section>
          ))}
      </CardContent>
    </Card>
  );
}

function QueueRow({
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
    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <Link href={`/leads/${lead.id}`} className="truncate font-medium hover:underline">
            {lead.studentName}
          </Link>
          {lead.temperature ? (
            <Badge variant="outline" className="text-xs">
              {lead.temperature}
            </Badge>
          ) : null}
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
        <p className="text-right text-sm text-muted-foreground">{describeReason(reason)}</p>
      </div>
    </div>
  );
}

/**
 * Exported so the queue's wording lives in one place — it was duplicated
 * between the widget and the old `/my-day` page, which is how two screens
 * start describing the same lead differently.
 */
export function describeReason(reason: MyDayReason): string {
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

export type { MyDayQueue };
