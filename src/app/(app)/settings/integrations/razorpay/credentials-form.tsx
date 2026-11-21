"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { saveRazorpayCredentials, type RazorpayFormState } from "./actions";

export function RazorpayCredentialsForm({ stored }: { stored: { key_id: boolean; key_secret: boolean; webhook_secret: boolean } }) {
  const [state, action, pending] = useActionState(saveRazorpayCredentials, {} as RazorpayFormState);
  const field = (name: keyof typeof stored, label: string, placeholder: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label} {stored[name] && <span className="text-xs font-normal text-green-700">· saved</span>}
      </label>
      <Input id={name} name={name} type="password" autoComplete="off" placeholder={stored[name] ? "Leave blank to keep the saved value" : placeholder} className="h-9 w-96" />
    </div>
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      {field("key_id", "Key ID", "rzp_live_…")}
      {field("key_secret", "Key Secret", "")}
      {field("webhook_secret", "Webhook secret", "The secret you set on the webhook")}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>Save</Button>
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}
