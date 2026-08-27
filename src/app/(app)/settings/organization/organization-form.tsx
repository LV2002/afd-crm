"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateOrgSettings, type OrgSettingsState } from "./actions";

interface OrgSettingsValues {
  name: string;
  logoUrl: string;
  primaryColor: string;
  timezone: string;
  currency: string;
  locale: string;
}

const initialState: OrgSettingsState = {};

export function OrganizationForm({ values }: { values: OrgSettingsValues }) {
  const [state, formAction, pending] = useActionState(updateOrgSettings, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Organisation name</Label>
        <Input id="name" name="name" defaultValue={values.name} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="logoUrl">Logo URL</Label>
        <Input id="logoUrl" name="logoUrl" type="url" defaultValue={values.logoUrl} placeholder="https://…" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="primaryColor">Primary colour</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Primary colour picker"
            defaultValue={values.primaryColor}
            className="h-9 w-10 shrink-0 rounded border border-input"
            onChange={(e) => {
              const input = document.getElementById("primaryColor") as HTMLInputElement | null;
              if (input) input.value = e.target.value;
            }}
          />
          <Input id="primaryColor" name="primaryColor" defaultValue={values.primaryColor} required />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input id="timezone" name="timezone" defaultValue={values.timezone} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="currency">Currency code</Label>
        <Input id="currency" name="currency" defaultValue={values.currency} maxLength={3} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="locale">Locale</Label>
        <Input id="locale" name="locale" defaultValue={values.locale} required />
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
