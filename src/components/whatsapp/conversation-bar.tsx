"use client";

import { Check, RotateCcw, Tag } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setConversationResolved, toggleConversationLabel } from "@/app/(app)/whatsapp/inbox-actions";
import type { InboxLabel } from "@/lib/whatsapp/inbox-tools";
import { cn } from "@/lib/utils";

import { chipClass } from "./label-colours";

/** "5h 12m left", "42m left", or null once it has closed. */
function remaining(closesAt: string | null, now: number): string | null {
  if (!closesAt) return null;
  const ms = new Date(closesAt).getTime() - now;
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m left` : `${Math.max(1, minutes)}m left`;
}

/**
 * The strip above a conversation: how long WhatsApp will still take a free
 * reply, the labels on it, and whether it is done with.
 */
export function ConversationBar({
  phone,
  labels,
  labelIds,
  resolved,
  windowClosesAt,
  canEdit,
}: {
  phone: string;
  labels: InboxLabel[];
  labelIds: string[];
  resolved: boolean;
  windowClosesAt: string | null;
  canEdit: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [pending, start] = useTransition();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const left = remaining(windowClosesAt, now);
  const mine = labels.filter((l) => labelIds.includes(l.id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            left ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100" : "bg-muted text-muted-foreground",
          )}
          title="WhatsApp only accepts a free reply within 24 hours of their last message."
        >
          {left ? `Reply window open · ${left}` : "Reply window closed"}
        </span>
        {resolved && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">Resolved</span>}
        {mine.map((l) => (
          <span key={l.id} className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", chipClass(l.colour))}>
            {l.name}
          </span>
        ))}
        {canEdit && (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPicking((v) => !v)}>
              <Tag className="size-4" /> Labels
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setConversationResolved(phone, !resolved);
                  setMessage(r.error);
                })
              }
            >
              {resolved ? <RotateCcw className="size-4" /> : <Check className="size-4" />}
              {resolved ? "Reopen" : "Mark resolved"}
            </Button>
          </>
        )}
      </div>
      {picking && (
        <div className="flex flex-wrap gap-1.5 rounded-md border p-2">
          {labels.length === 0 && <span className="text-xs text-muted-foreground">No labels yet. Add them under WhatsApp → Saved replies &amp; labels.</span>}
          {labels.map((l) => {
            const on = labelIds.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await toggleConversationLabel(phone, l.id);
                    setMessage(r.error);
                  })
                }
                className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium ring-offset-1", chipClass(l.colour), on ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100")}
              >
                {on ? "✓ " : ""}
                {l.name}
              </button>
            );
          })}
        </div>
      )}
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  );
}
