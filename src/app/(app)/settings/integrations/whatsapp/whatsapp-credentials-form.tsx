"use client";

import { useActionState, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/layout/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  saveWhatsAppCredentials,
  testWhatsAppConnection,
  type WhatsAppConnectionStatus,
  type WhatsAppFormState,
} from "./actions";

const initialState: WhatsAppFormState = {};

const FIELDS: Array<{ key: keyof WhatsAppConnectionStatus["configured"]; label: string; help: string }> = [
  {
    key: "app_secret",
    label: "App Secret",
    // The failure this wording exists to prevent: WhatsApp keeps its own
    // copy of the secret, and filling in the Meta integration's does not
    // fill in this one. When it is wrong every inbound delivery is
    // refused with a 401 — correct behaviour, invisible from the inbox,
    // and indistinguishable from Meta never having called at all.
    help: "The Meta App's secret, from App Dashboard → Settings → Basic. This is a SEPARATE copy from the one on Settings → Integrations → Meta — setting that one does not set this one, and it is usually the same value because it is the same Meta app. If it is wrong every incoming message is rejected and the inbox stays empty; Settings → Platform health → Inbound deliveries shows that as rejected.",
  },
  {
    key: "verify_token",
    label: "Verify Token",
    help: "Any value you choose — re-enter this exact value in Meta's WhatsApp webhook subscription dialog.",
  },
  {
    key: "access_token",
    label: "Access Token",
    help: "A System User token with whatsapp_business_messaging permission.",
  },
  {
    key: "phone_number_id",
    label: "Phone Number ID",
    help: "The institute's WhatsApp Business API number, from Meta's WhatsApp Manager. One number for the whole CRM — this is NOT a counsellor's personal WhatsApp Business app number, and registering a number here ends its use in that app.",
  },
  {
    key: "waba_id",
    label: "WhatsApp Business Account ID",
    help: "The account the number sits under, also in WhatsApp Manager. Needed to create and check message templates; sending works without it.",
  },
];

export function WhatsAppCredentialsForm({ status }: { status: WhatsAppConnectionStatus }) {
  const [state, formAction, pending] = useActionState(saveWhatsAppCredentials, initialState);
  const [testing, startTest] = useTransition();
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

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
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {/*
          Confirms the number answers to the token, without sending
          anybody a message — the one check that catches a wrong id or an
          expired token before a counsellor finds out mid-conversation.
        */}
        <Button
          type="button"
          variant="outline"
          disabled={testing}
          onClick={() => startTest(async () => setTestResult(await testWhatsAppConnection()))}
        >
          {testing ? "Checking…" : "Test connection"}
        </Button>
      </div>
      {testResult && (
        <p className={testResult.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {testResult.message}
        </p>
      )}
    </form>
  );
}
