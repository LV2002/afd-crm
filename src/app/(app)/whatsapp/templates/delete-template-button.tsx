"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { removeTemplate } from "./actions";

/**
 * Two clicks, not a confirm dialog: deleting removes every language
 * version of the template on Meta's side and cannot be undone, but this
 * is a settings-shaped screen where a modal for one button is heavier
 * than the risk.
 */
export function DeleteTemplateButton({ name }: { name: string }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!armed) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setArmed(true)}>
        Delete
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await removeTemplate(name);
            if (result.error) setError(result.error);
            else setArmed(false);
          })
        }
      >
        {pending ? "Deleting…" : "Confirm"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
