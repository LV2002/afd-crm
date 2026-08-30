"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/layout/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveWhatsAppCredentials, type WhatsAppConnectionStatus, type WhatsAppFormState } from "./actions";

const initialState: WhatsAppFormState = {};

const FIELDS: Array<{ key: keyof WhatsAppConnectionStatus["configured"]; label: string; help: string }> = [
  {
    key: "app_secret",
    label: "App Secret",
    help: "The Meta App's secret — used to verify webhook signatures, same mechanism as the Meta Lead Ads integration.",
  },
  {
    key: "verify_token",
    label: "Verify Token",
    help: "Any value you choose — re-enter this exact value in Meta's WhatsApp webhook subscription dialog.",
  },
  {
    key: "access_token",
    label: "Access Token",
    help: "A System User token with whatsapp_business_messaging permission — one token works for every counsellor's number below.",
  },
];

export function WhatsAppCredentialsForm({ status }: { status: WhatsAppConnectionStatus }) {
  const [state, formAction, pending] = useActionState(saveWhatsAppCredentials, initialState);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {FIELDS.map((field) => (
        <div key={field.key} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Badge variant={status.configured[field.key] ? "default" : "secondary"} className="text-xs">
              {status.configured[field.key] ? "Set" : "Not set"}
            </Badge>
          </div>
          <Input
            id={field.key}
            name={field.key}
            type="password"
            placeholder={status.configured[field.key] ? "Leave blank to keep the current value" : ""}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">{field.help}</p>
        </div>
      ))}

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
