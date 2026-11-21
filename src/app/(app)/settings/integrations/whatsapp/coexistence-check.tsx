"use client";

import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import type { CheckLine } from "@/lib/whatsapp/coexistence-check";

import { runCoexistenceCheck, tickMissingWebhookFields, type CoexistenceCheckState } from "./coexistence-check-actions";

const ICON = {
  ok: <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />,
  problem: <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />,
  unknown: <CircleHelp className="mt-0.5 size-4 shrink-0 text-muted-foreground" />,
} as const;

/** "Why aren't chats arriving?" — reads Meta's side and says which link is broken, with a button for the one the CRM can fix. */
export function CoexistenceCheck() {
  const [state, setState] = useState<CoexistenceCheckState>({});
  const [pending, start] = useTransition();
  const lines: CheckLine[] = state.lines ?? [];
  const canFix = lines.some((l) => l.fixable);

  return (
    <div className="flex max-w-2xl flex-col gap-3 rounded-lg border p-4">
      <div>
        <h3 className="font-medium">Check why chats aren&rsquo;t arriving</h3>
        <p className="text-sm text-muted-foreground">
          Reads the app&rsquo;s webhook settings straight from Meta and tells you which step is missing. No developer-dashboard login needed.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => start(async () => setState(await runCoexistenceCheck()))}>
          {pending ? "Checking…" : "Run the check"}
        </Button>
        {canFix && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const fixed = await tickMissingWebhookFields();
                const again = await runCoexistenceCheck();
                setState({ ...again, error: fixed.error, success: fixed.success });
              })
            }
          >
            Tick the missing webhook fields
          </Button>
        )}
      </div>
      <FormMessage error={state.error} success={state.success} />
      {lines.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => (
            <li key={line.id} className="flex items-start gap-2 text-sm">
              {ICON[line.status]}
              <div>
                <p className="font-medium">{line.label}</p>
                <p className="text-xs text-muted-foreground">{line.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
