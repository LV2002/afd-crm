"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/smart-inputs";
import { Textarea } from "@/components/ui/textarea";

import { updateOrgSettings, type OrgSettingsState } from "./actions";

export interface OrgSettingsValues {
  name: string;
  legalName: string;
  tagline: string;
  logoUrl: string;
  logoPreviewUrl: string | null;
  primaryColor: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  documentFooter: string;
  timezone: string;
  currency: string;
  locale: string;
}

const initialState: OrgSettingsState = {};

/**
 * The institute's identity, in the order somebody would say it.
 *
 * Grouped into three sections rather than one long column, because these
 * answer three different questions — who you are, how to reach you, and
 * how the system counts — and a flat list of sixteen boxes is a form
 * people abandon halfway.
 *
 * The section headings say where each thing shows up. "Logo" means
 * nothing on its own; "printed on every receipt, agreement and profile
 * sheet" is why somebody would bother filling it in.
 */
export function OrganizationForm({ values }: { values: OrgSettingsValues }) {
  const [state, formAction, pending] = useActionState(updateOrgSettings, initialState);
  const [colour, setColour] = useState(values.primaryColor);
  const [chosenLogo, setChosenLogo] = useState<string | null>(null);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold">Identity</h2>
          <p className="text-sm text-muted-foreground">
            Printed at the top of every receipt, fee agreement and profile sheet.
          </p>
        </div>

        <Field label="Name" htmlFor="name" required hint="What families call you.">
          <Input id="name" name="name" defaultValue={values.name} required />
        </Field>

        <Field
          label="Legal name"
          htmlFor="legalName"
          hint="Only if the name on a contract differs — a Pvt Ltd, a trust. Left empty, the name above is used."
        >
          <Input id="legalName" name="legalName" defaultValue={values.legalName} />
        </Field>

        <Field label="Tagline" htmlFor="tagline" hint="The line under the logo. Optional.">
          <Input
            id="tagline"
            name="tagline"
            defaultValue={values.tagline}
            placeholder="gateway to global design schools"
          />
        </Field>

        <Field
          label="Logo"
          htmlFor="logoFile"
          hint="PNG, JPG, WebP or SVG. A wide logo prints better than a tall one."
        >
          <div className="flex flex-col gap-3">
            {(chosenLogo || values.logoPreviewUrl) && (
              // A signed Storage URL, or a blob: from the file the person
              // just chose — neither is a host next/image can be told about.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={chosenLogo ?? values.logoPreviewUrl!}
                alt="Current logo"
                className="max-h-16 w-auto rounded border bg-white p-2"
              />
            )}
            <Input
              id="logoFile"
              name="logoFile"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setChosenLogo(file ? URL.createObjectURL(file) : null);
              }}
            />
          </div>
        </Field>

        <Field
          label="Or link to a logo"
          htmlFor="logoUrl"
          hint="If your logo already lives on your website. Choosing a file above replaces this."
        >
          <Input
            id="logoUrl"
            name="logoUrl"
            defaultValue={values.logoUrl.startsWith("brand/") ? "" : values.logoUrl}
            placeholder="https://…"
          />
        </Field>

        <Field
          label="Brand colour"
          htmlFor="primaryColor"
          hint="The accent on printed documents — section headings, rules, the amount on a receipt."
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Brand colour picker"
              value={colour}
              onChange={(event) => setColour(event.target.value)}
              className="h-10 w-12 shrink-0 rounded border border-input"
            />
            <Input
              id="primaryColor"
              name="primaryColor"
              value={colour}
              onChange={(event) => setColour(event.target.value)}
              required
            />
          </div>
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold">Contact details</h2>
          <p className="text-sm text-muted-foreground">
            The block under your name on a document. Anything left empty is simply left off — no
            gaps, no stray commas.
          </p>
        </div>

        <Field label="Address" htmlFor="addressLine">
          <Input
            id="addressLine"
            name="addressLine"
            defaultValue={values.addressLine}
            placeholder="2nd Floor, MG Road"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" defaultValue={values.city} />
          </Field>
          <Field label="State" htmlFor="state">
            <Input id="state" name="state" defaultValue={values.state} />
          </Field>
          <Field label="PIN code" htmlFor="pincode">
            <Input id="pincode" name="pincode" defaultValue={values.pincode} inputMode="numeric" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="phone">
            <PhoneInput id="phone" name="phone" defaultValue={values.phone} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={values.email} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website" htmlFor="website">
            <Input id="website" name="website" defaultValue={values.website} />
          </Field>
          <Field
            label="GSTIN"
            htmlFor="gstin"
            hint="Printed on fee documents. Left empty, the line does not appear at all."
          >
            <Input id="gstin" name="gstin" defaultValue={values.gstin} />
          </Field>
        </div>

        <Field
          label="Document footer"
          htmlFor="documentFooter"
          hint="One line at the bottom of every printed document — a refund policy pointer, a terms reference."
        >
          <Textarea
            id="documentFooter"
            name="documentFooter"
            rows={2}
            defaultValue={values.documentFooter}
            placeholder="Fees once paid are non-refundable. Full terms at afdindia.com/terms"
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold">Regional</h2>
          <p className="text-sm text-muted-foreground">
            How dates and money are read across the system.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Timezone" htmlFor="timezone">
            <Input id="timezone" name="timezone" defaultValue={values.timezone} required />
          </Field>
          <Field label="Currency" htmlFor="currency">
            <Input
              id="currency"
              name="currency"
              defaultValue={values.currency}
              maxLength={3}
              required
            />
          </Field>
          <Field label="Locale" htmlFor="locale">
            <Input id="locale" name="locale" defaultValue={values.locale} required />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}
