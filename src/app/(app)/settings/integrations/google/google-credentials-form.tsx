"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/layout/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveGoogleCredentials, type GoogleConnectionStatus, type GoogleFormState } from "./actions";

const initialState: GoogleFormState = {};

const FIELDS: Array<{ key: keyof GoogleConnectionStatus["configured"]; label: string; help: string; secret: boolean }> = [
  {
    key: "google_key",
    label: "Webhook Verify Key",
    help: "Any value you choose — re-enter this exact value in Google Ads' Lead Form webhook setup dialog.",
    secret: true,
  },
  { key: "client_id", label: "OAuth Client ID", help: "From a Google Cloud project with the Google Ads API enabled.", secret: false },
  { key: "client_secret", label: "OAuth Client Secret", help: "From the same Google Cloud OAuth client.", secret: true },
  {
    key: "refresh_token",
    label: "OAuth Refresh Token",
    help: "Generated once via Google's OAuth consent flow for an account with access to the ad account below.",
    secret: true,
  },
  {
    key: "developer_token",
    label: "Developer Token",
    help: "From your Google Ads Manager account — API Center.",
    secret: true,
  },
  { key: "customer_id", label: "Customer ID", help: "The ad account id, digits only (no dashes).", secret: false },
  {
    key: "conversion_action",
    label: "Offline Conversion Action",
    help:
      "The full resource name (customers/1234567890/conversionActions/987654321) of an action created in Google Ads as \u201cImport \u2014 from clicks\u201d. This is what admissions get reported against, so Smart Bidding optimises for students rather than form fills.",
    secret: false,
  },
  {
    key: "login_customer_id",
    label: "Manager (Login) Customer ID",
    help: "Only needed if the account above is managed under an MCC — digits only. Leave blank otherwise.",
    secret: false,
  },
];

export function GoogleCredentialsForm({ status }: { status: GoogleConnectionStatus }) {
  const [state, formAction, pending] = useActionState(saveGoogleCredentials, initialState);

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
            type={field.secret ? "password" : "text"}
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
