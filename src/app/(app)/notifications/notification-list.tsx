"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, X } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/actions";

import type { NotificationRow } from "@/lib/notifications/get-notifications";

export function NotificationList({
  rows,
  unreadOnly,
}: {
  rows: NotificationRow[];
  unreadOnly: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          {unreadOnly ? "Nothing unread." : "Nothing yet."}
        </p>
      </div>
    );
  }

  const hasUnread = rows.some((row) => row.read_at === null);

  return (
    <div className="flex flex-col gap-2">
      {hasUnread && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => run(markAllNotificationsRead)}
          >
            <CheckCheck className="size-4" /> Mark all read
          </Button>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const unread = row.read_at === null;
          return (
            <li
              key={row.id}
              className={
                unread
                  ? "flex items-start gap-3 rounded-lg border border-l-4 border-l-primary p-4"
                  : "flex items-start gap-3 rounded-lg border p-4 opacity-70"
              }
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="font-medium">{row.title}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatWhen(row.created_at)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{row.body}</p>
                {row.href && (
                  <Link
                    href={row.href}
                    className="mt-1 inline-block text-sm font-medium underline"
                    // Opening it is reading it. Marking read on click means
                    // the badge reflects what has actually been looked at
                    // rather than what has been scrolled past.
                    onClick={() => run(() => markNotificationRead(row.id))}
                  >
                    Open
                  </Link>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {unread && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    aria-label="Mark read"
                    onClick={() => run(() => markNotificationRead(row.id))}
                  >
                    <CheckCheck className="size-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isPending}
                  aria-label="Dismiss"
                  onClick={() => run(() => dismissNotification(row.id))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Relative for the first day, then a real date. "3 hours ago" is what you
 * want on a breach you might still fix; "12 Sep" is what you want on
 * anything older, where the exact hour has stopped mattering.
 */
function formatWhen(iso: string): string {
  const then = new Date(iso);
  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  return then.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}
