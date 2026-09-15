"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";

export interface AuditEntryData {
  id: string;
  when: string;
  actor: string;
  sentence: string;
  entityType: string;
  entityId: string | null;
  href: string | null;
  before: Array<{ key: string; value: string }>;
  after: Array<{ key: string; value: string }>;
}

/**
 * One row, with its payload folded away.
 *
 * Every audit row carries a `before`/`after` jsonb of whatever the call
 * site thought was worth keeping, and the shapes differ wildly. Showing
 * them all expanded turns the page into a wall; hiding them entirely
 * makes the log useless for the question people actually bring to it
 * ("what did it say before?"). So: one line each by default, and the
 * detail on request.
 */
export function AuditEntry({ entry }: { entry: AuditEntryData }) {
  const [open, setOpen] = React.useState(false);
  const hasDetail = entry.before.length > 0 || entry.after.length > 0;

  return (
    <div className="flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-[0.9375rem]">
            <span className="font-medium">{entry.actor}</span>{" "}
            <span className="text-muted-foreground">·</span> {entry.sentence}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{entry.when}</span>
            <Badge variant="outline">{entry.entityType}</Badge>
            {entry.href ? (
              <Link href={entry.href} className="hover:underline">
                open it
              </Link>
            ) : (
              entry.entityId && <span className="font-mono">{entry.entityId.slice(0, 8)}</span>
            )}
          </p>
        </div>

        {hasDetail && (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="inline-flex min-h-9 items-center gap-1 rounded px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {open ? "Hide" : "Details"}
            <ChevronDown className={open ? "size-4 rotate-180 transition" : "size-4 transition"} />
          </button>
        )}
      </div>

      {open && hasDetail && (
        <div className="grid gap-4 rounded-md bg-muted/60 p-3 text-sm sm:grid-cols-2">
          <PayloadList title="Before" lines={entry.before} empty="Nothing recorded." />
          <PayloadList title="After" lines={entry.after} empty="Nothing recorded." />
        </div>
      )}
    </div>
  );
}

function PayloadList({
  title,
  lines,
  empty,
}: {
  title: string;
  lines: Array<{ key: string; value: string }>;
  empty: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      {lines.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <dl className="mt-1 flex flex-col gap-0.5">
          {lines.map((line) => (
            <div key={line.key} className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">{line.key}:</dt>
              <dd className="min-w-0 break-words">{line.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
