"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { isLivePath } from "@/lib/leads/live-refresh-paths";
import { createClient } from "@/lib/supabase/browser";

/** A browser that cannot hold a socket open still catches up this often. */
const FALLBACK_POLL_MS = 60_000;
/** Coming back to the tab after longer than this refreshes at once. */
const STALE_AFTER_MS = 30_000;
/** A burst of leads (an import, a Meta batch) becomes one refresh. */
const DEBOUNCE_MS = 1_500;

/**
 * Keeps the work lists live.
 *
 * Leon: *"if the CRM is already open it doesn't show newly loaded leads
 * until I refresh the page. This doesn't allow my sales team to call them
 * as asap."*
 *
 * Three layers, each covering the one before it:
 *
 * 1. **Realtime.** A lead inserted or reassigned reaches every open tab
 *    within a second or two, through Supabase Realtime. It runs as the
 *    signed-in user, so row security decides what arrives: a counsellor is
 *    told about their own leads and nobody else's.
 * 2. **On return.** A laptop that slept or a tab left in the background
 *    refreshes the moment it is looked at again.
 * 3. **A slow poll.** A minute at most, only while the tab is visible,
 *    for a network that drops sockets.
 *
 * `router.refresh()` re-renders the server components in place, so scroll
 * position and filters stay where they are.
 */
export function LiveRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const live = isLivePath(pathname);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!live) return;

    const refreshSoon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    const supabase = createClient();
    const channel = supabase
      .channel("live-leads")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, (payload) => {
        const row = payload.new as { id?: string; student_name?: string };
        toast.success(`New lead: ${row.student_name ?? "unnamed"}`, {
          action: row.id ? { label: "Open", onClick: () => router.push(`/leads/${row.id}`) } : undefined,
        });
        refreshSoon();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, refreshSoon)
      .subscribe();

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, FALLBACK_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      if (hiddenAt.current && Date.now() - hiddenAt.current > STALE_AFTER_MS) router.refresh();
      hiddenAt.current = null;
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [live, router]);

  return null;
}
