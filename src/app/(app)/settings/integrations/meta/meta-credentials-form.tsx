"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/layout/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveMetaCredentials, type MetaConnectionStatus, type MetaFormState } from "./actions";

const initialState: MetaFormState = {};

const FIELDS: Array<{ key: keyof MetaConnectionStatus["configured"]; label: string; help: string; secret: boolean }> = [
  { key: "app_id", label: "App ID", help: "From your Meta App Dashboard.", secret: false },
  { key: "app_secret", label: "App Secret", help: "Meta App Dashboard → Settings → Basic.", secret: true },
  {
    key: "verify_token",
    label: "Verify Token",
    help: "Any value you choose — re-enter this exact value in Meta's webhook subscription dialog.",
    secret: true,
  },
  {
    key: "page_access_token",
    label: "Page Access Token",
    help: "A long-lived token for the Facebook Page your lead ads run on — used to fetch a submitted lead's answers.",
    secret: true,
  },
  {
    key: "ads_access_token",
    label: "Ads Access Token",
    help: "A System User or Marketing API token with ads_read/ads_management — used for the spend and retargeting syncs. Usually different from the Page token above.",
    secret: true,
  },
  { key: "ad_account_id", label: "Ad Account ID", help: "Numeric id, without the act_ prefix.", secret: false },
];

export function MetaCredentialsForm({ status }: { status: MetaConnectionStatus }) {
  const [state, formAction, pending] = useActionState(saveMetaCredentials, initialState);

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
