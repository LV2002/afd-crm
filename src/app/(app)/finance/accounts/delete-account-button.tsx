"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteAccount } from "@/lib/finance/actions";

/** Deletes an account that was set up by mistake. The server refuses if it has any history. */
export function DeleteAccountButton({ accountId, name }: { accountId: string; name: string }) {
  const [message, setMessage] = useState<string | undefined>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Delete ${name}? This is for an account added by mistake.`)) return;
          start(async () => {
            const result = await deleteAccount(accountId);
            setMessage(result.error);
          });
        }}
      >
        {pending ? "Deleting…" : "Delete"}
      </Button>
      {message && <p className="max-w-xs text-right text-xs text-destructive">{message}</p>}
    </div>
  );
}
