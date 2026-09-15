"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";

import { generateWebsiteSecret, type WebsiteFormState } from "./actions";

const initialState: WebsiteFormState = {};

export function SecretPanel({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState(
    async () => generateWebsiteSecret(),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="max-w-xl text-sm text-muted-foreground">
        {configured
          ? "A signing key is already set. Generating a new one immediately stops the old one working — the script on your website has to be updated in the same sitting, or enquiries will start being rejected."
          : "Generate the key, paste it into the Apps Script on your website, and the forms start arriving here."}
      </p>

      {configured ? (
        <ConfirmSubmit
          label="Generate a new key"
          title="Replace the website signing key"
          body="The current key stops working the moment this is done. Website enquiries will be rejected until the Apps Script is updated with the new one — so have that script open before you confirm."
          confirmLabel="Generate a new key"
          variant="destructive"
          disabled={pending}
          pending={pending}
          pendingLabel="Generating…"
        />
      ) : (
        <Button type="submit" disabled={pending} className="w-fit">
          <KeyRound className="size-4" />
          {pending ? "Generating…" : "Generate the signing key"}
        </Button>
      )}

      {state.secret && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">Your signing key — copy it now</p>
          <code className="block overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-sm">
            {state.secret}
          </code>
          <p className="text-xs text-muted-foreground">
            It is stored encrypted and there is no screen that can show it again. If it is lost,
            generate a new one and update the script.
          </p>
        </div>
      )}

      <FormMessage error={state.error} success={state.secret ? undefined : state.success} />
    </form>
  );
}
