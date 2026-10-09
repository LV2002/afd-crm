"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

/**
 * Mine, or everybody's.
 *
 * Shown only to somebody who can assign leads, because for a counsellor
 * the two produce the same rows — RLS already limits them to their own —
 * and a switch that changes nothing is worse than no switch.
 *
 * `replace` rather than `push`: flipping this is changing the view, not
 * navigating, and three flips should not mean three presses of Back to
 * leave the screen.
 */
export function FollowupScope({ scope }: { scope: "mine" | "all" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function set(next: "mine" | "all") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.set("scope", "all");
    else params.delete("scope");
    params.delete("page");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex items-center gap-1 rounded-md border p-1" aria-busy={isPending}>
      <Button
        type="button"
        size="sm"
        variant={scope === "mine" ? "secondary" : "ghost"}
        onClick={() => set("mine")}
        aria-pressed={scope === "mine"}
      >
        Mine
      </Button>
      <Button
        type="button"
        size="sm"
        variant={scope === "all" ? "secondary" : "ghost"}
        onClick={() => set("all")}
        aria-pressed={scope === "all"}
      >
        Everyone
      </Button>
    </div>
  );
}
