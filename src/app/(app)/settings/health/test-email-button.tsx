"use client";

import { Mail } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { sendTestEmail, type HealthState } from "./actions";

/**
 * Press it, read what the mail provider said.
 *
 * Deliberately not hidden behind "email is configured". The case worth
 * testing most is the one where the screen already claims email works and
 * nothing arrives — a revoked key, an unverified domain, a sandbox that
 * only delivers to one address. So the button is always there, and the
 * refusal is the useful output.
 */
export function TestEmailButton() {
  const [result, setResult] = useState<HealthState | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        className="w-fit"
        onClick={() => startTransition(async () => setResult(await sendTestEmail()))}
      >
        <Mail className="size-4" />
        {pending ? "Sending…" : "Send a test email"}
      </Button>

      {result?.error && <p className="text-sm text-destructive">{result.error}</p>}
      {result?.success && <p className="text-sm text-success">{result.success}</p>}
    </div>
  );
}
