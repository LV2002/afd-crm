"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import type { BackfillState } from "@/lib/integrations/ad-spend-backfill";
import type { AdSpendHistory } from "@/lib/integrations/ad-spend-history";

const initialState: BackfillState = {};

/**
 * Import past ad spend, one bounded chunk per press.
 *
 * Deliberately not a "fetch everything" button. A serverless function is
 * killed at its time limit with no error anybody sees, so a single
 * enormous import would look exactly like one that worked and stopped
 * early — and ad spend that is quietly half-imported is worse than none,
 * because every cost-per-lead figure on the reports would be confidently
 * wrong.
 *
 * So each press fetches ninety days further back, says what it found,
 * and shows where the history now starts. Four presses is a year.
 */
export function ImportAdSpend({
  history,
  action,
  platformName,
}: {
  history: AdSpendHistory;
  action: (state: BackfillState, formData: FormData) => Promise<BackfillState>;
  platformName: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const { nextWindow } = history;

  return (
    <div className="flex max-w-lg flex-col gap-3">
      <div className="rounded-lg border p-3 text-sm">
        {history.daysStored === 0 ? (
          <p className="text-muted-foreground">
            No {platformName} spend has been imported yet. The nightly sync fills this in from
            tomorrow morning; the button below pulls the history in now.
          </p>
        ) : (
          <p>
            <strong>
              {history.earliest} to {history.latest}
            </strong>{" "}
            <span className="text-muted-foreground">
              · {history.daysStored} day{history.daysStored === 1 ? "" : "s"} with spend,{" "}
              {history.rows.toLocaleString("en-IN")} rows
            </span>
          </p>
        )}
      </div>

      <form action={formAction} className="flex flex-col gap-2">
        <Button type="submit" variant="outline" disabled={pending || !nextWindow} className="w-fit">
          {pending
            ? "Importing… this can take a minute"
            : nextWindow
              ? `Import ${nextWindow.since} to ${nextWindow.until}`
              : "Nothing older to import"}
        </Button>
        <FormMessage error={state.error} success={state.success} />
        <p className="text-xs text-muted-foreground">
          Ninety days per press, oldest-first, so a year is four presses. Safe to repeat: a day
          already stored is updated in place, never duplicated. {platformName} keeps roughly
          three years of figures, after which there is nothing left to fetch.
        </p>
      </form>
    </div>
  );
}
