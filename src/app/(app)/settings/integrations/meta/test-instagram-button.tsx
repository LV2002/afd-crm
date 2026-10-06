"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { testInstagramAccess } from "./actions";

/**
 * Reads the linked Instagram account, and says what Meta answered.
 *
 * Distinct from "Test connection" next to it, which asks `debug_token`
 * what a token *claims*. This asks Meta for an actual Instagram account
 * with that token, which is the only way to know the link works.
 *
 * It is also a real `instagram_basic` call, and Meta will not let an app
 * request Advanced Access to a permission it has never successfully
 * used — the button on App Review stays greyed with the API-calls column
 * reading zero. Doing it here beats the Graph API Explorer, where a
 * Business-owned Page needs a System User token before the same call is
 * even possible.
 */
export function TestInstagramButton() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        className="w-fit"
        onClick={() => startTransition(async () => setResult(await testInstagramAccess()))}
      >
        {isPending ? "Reading…" : "Test Instagram access"}
      </Button>
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`max-w-prose text-sm ${result.ok ? "text-emerald-600" : "text-destructive"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
