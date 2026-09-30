"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateIST } from "@/lib/format/date";
import type { CounsellorActivity } from "@/lib/reports/activity-log";

/**
 * One counsellor's day, collapsed to a summary line until you want the
 * detail.
 *
 * Leon asked to see "who they made those calls to", which is the detail —
 * but a centre head with six counsellors does not want two hundred rows the
 * moment the page loads. So the counts are always visible and the list of
 * names is one click away, per person.
 *
 * A row with nothing logged says so in words rather than showing a zero. A
 * zero in a table of numbers reads as an unremarkable value; "nothing logged"
 * is the finding.
 */
export function PersonActivity({
  person,
  talkTime,
}: {
  person: CounsellorActivity;
  talkTime: string;
}) {
  const [open, setOpen] = useState(false);
  const silent = person.total === 0;

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => !silent && setOpen((value) => !value)}
        aria-expanded={silent ? undefined : open}
        disabled={silent}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 p-3 text-left disabled:cursor-default"
      >
        {silent ? (
          <span className="size-4 shrink-0" />
        ) : open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}

        <span className="font-medium">{person.name}</span>

        {silent ? (
          <span className="text-sm text-muted-foreground">Nothing logged</span>
        ) : (
          <>
            <span className="text-sm tabular-nums">
              {person.total} {person.total === 1 ? "interaction" : "interactions"}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {person.peopleContacted} {person.peopleContacted === 1 ? "person" : "people"}
            </span>

            <span className="flex flex-wrap gap-1.5">
              {person.byType.map((entry) => (
                <Badge key={entry.value} variant="secondary" className="text-xs">
                  {entry.value} {entry.count}
                </Badge>
              ))}
            </span>

            <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground tabular-nums">
              {talkTime !== "—" ? <span>{talkTime} on calls</span> : null}
              <span>
                {person.withNextStep}/{person.total} with a next step
              </span>
            </span>
          </>
        )}
      </button>

      {open && !silent ? (
        <div className="border-t bg-muted/30">
          <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
            {person.byOutcome.map((entry) => (
              <Badge key={entry.value} variant="outline" className="text-xs">
                {entry.value}: {entry.count}
              </Badge>
            ))}
            {person.inbound > 0 ? (
              <Badge variant="outline" className="text-xs">
                {person.inbound} inbound
              </Badge>
            ) : null}
          </div>

          <ul className="flex flex-col divide-y">
            {person.interactions.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
                <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatDateIST(row.occurredAt, "h:mm a")}
                </span>

                <Link href={`/leads/${row.leadId}`} className="font-medium hover:underline">
                  {row.leadName}
                </Link>

                <span className="text-sm text-muted-foreground">{row.type}</span>

                {row.outcome ? (
                  <Badge variant="outline" className="text-xs">
                    {row.outcome}
                  </Badge>
                ) : null}

                {row.direction === "inbound" ? (
                  <span className="text-xs text-muted-foreground">inbound</span>
                ) : null}

                {row.notes ? (
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {row.notes}
                  </span>
                ) : null}

                {row.nextFollowupAt ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    next {formatDateIST(row.nextFollowupAt, "d MMM")}
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-amber-600 dark:text-amber-500">
                    no next step
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
