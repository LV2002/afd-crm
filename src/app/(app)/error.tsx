"use client";

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * What a person sees when a screen crashes, and how anybody finds out.
 *
 * Before this there was no boundary at all: a failure inside any screen
 * produced Next.js's default page and told nobody. The whole class of
 * "it went white for a counsellor in Kannur" was invisible.
 *
 * The copy is deliberately not an apology or a stack trace. It says what
 * happened, that it has been reported, and offers the one action worth
 * trying — which is what somebody in the middle of a call actually needs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Fire and forget. If reporting the crash also fails there is nothing
    // useful left to do about it in the browser.
    void fetch("/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        path: window.location.pathname,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4 rounded-lg border bg-card p-6">
      <h2 className="text-xl font-semibold">This screen didn&rsquo;t load</h2>
      <p className="text-muted-foreground">
        Something went wrong on our side, not yours. It has been reported automatically — nothing
        you were doing has been lost.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>
          <RefreshCw className="size-4" />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <a href="/my-day">Go to My Day</a>
        </Button>
      </div>
      {error.digest && (
        <p className="text-sm text-muted-foreground">
          If you report this, quote <span className="font-mono">{error.digest}</span>.
        </p>
      )}
    </div>
  );
}
