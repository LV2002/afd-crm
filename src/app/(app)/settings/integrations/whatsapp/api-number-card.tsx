"use client";

import { Unplug } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";

import { disconnectApiNumber, type WhatsAppConnectionStatus, type WhatsAppFormState } from "./actions";
import { WhatsAppCredentialsForm } from "./whatsapp-credentials-form";

const initial: WhatsAppFormState = {};

/**
 * The institute's API number, as one card in the same list as every
 * counsellor's number — not a special header above them. It carries its own
 * details (Phone Number ID, account ID, access token), a Test connection
 * button and its own Disconnect, exactly as the others carry theirs.
 */
export function ApiNumberCard({ status, apiNumberId }: { status: WhatsAppConnectionStatus; apiNumberId: string | null }) {
  const connected = Boolean(apiNumberId && status.configured.access_token);
  const [open, setOpen] = useState(!connected);
  const [state, action] = useActionState(disconnectApiNumber, initial);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">Institute&rsquo;s API number</h3>
            <Badge variant="outline">API</Badge>
            <Badge variant="outline">Campaigns &amp; broadcasts</Badge>
            {!connected && <Badge variant="secondary">Not connected</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {apiNumberId ? (
              <>
                Phone Number ID <span className="font-mono">{apiNumberId}</span>
              </>
            ) : (
              "Not connected yet — enter its details below."
            )}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(!open)}>
          {open ? "Close" : connected ? "Edit" : "Connect"}
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t pt-3">
          <WhatsAppCredentialsForm status={status} keys={["access_token", "phone_number_id", "waba_id"]} withTest submitLabel={connected ? "Save changes" : "Connect the API number"} />
          {connected && (
            <form action={action} className="flex flex-wrap items-center gap-2 border-t pt-3">
              <ConfirmSubmit
                label="Disconnect the API number"
                icon={<Unplug className="size-4" />}
                size="sm"
                variant="destructive"
                title="Disconnect the institute's API number?"
                body="Removes its saved access token, Phone Number ID and account ID. Broadcasts, templates and automations stop until it is connected again. Chats and leads are not touched."
                confirmLabel="Disconnect it"
              />
              <FormMessage error={state.error} success={state.success} />
            </form>
          )}
        </div>
      )}
    </div>
  );
}

