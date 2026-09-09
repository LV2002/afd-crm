"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { MoneyInput, PhoneInput } from "@/components/ui/smart-inputs";
import { Textarea } from "@/components/ui/textarea";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

/**
 * Renders the right input for a field's *type* — one place that decides
 * "text box vs dropdown vs checkboxes", so a brand-new custom field of an
 * existing type edits correctly with no new code.
 *
 * This is also the highest-leverage place in the application to reduce
 * data-entry mistakes: every custom field an admin ever adds, and the
 * whole student profile form, is rendered from this switch. A `select`
 * here becomes a searchable one everywhere at once; a `currency` field
 * starts saying "₹45,000" back on every screen that has one.
 *
 * Phone-type fields on the LEAD are deliberately handled elsewhere: see
 * lead-edit-form.tsx for why.
 */
export function DynamicFieldInput({
  field,
  name,
  defaultValue,
  options,
}: {
  field: FieldSchemaEntry;
  name: string;
  defaultValue: unknown;
  options: FieldOption[];
}) {
  switch (field.type) {
    case "boolean":
      return <Checkbox name={name} defaultChecked={Boolean(defaultValue)} />;

    case "long_text":
      return <Textarea name={name} defaultValue={(defaultValue as string) ?? ""} rows={3} />;

    case "date":
      return <Input type="date" name={name} defaultValue={toDateInputValue(defaultValue)} />;

    case "datetime":
      return <Input type="datetime-local" name={name} defaultValue={toDateTimeInputValue(defaultValue)} />;

    case "number":
      return <Input type="number" name={name} defaultValue={(defaultValue as number) ?? ""} />;

    case "currency":
      // Says the amount back in words as it is typed. A missing zero is
      // invisible as digits and obvious as "₹4,500".
      return <MoneyInput name={name} defaultValue={String(defaultValue ?? "")} />;

    case "select":
    case "user_ref":
      return (
        <Combobox
          name={name}
          defaultValue={(defaultValue as string) ?? ""}
          options={options}
          placeholder={`Choose ${field.label.toLowerCase()}`}
          clearable
        />
      );

    case "multiselect": {
      const current = Array.isArray(defaultValue) ? (defaultValue as string[]) : [];
      return (
        <div className="flex flex-col gap-1.5">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem] font-normal"
            >
              <Checkbox
                name={name}
                value={option.value}
                defaultChecked={current.includes(option.value)}
                className="size-5"
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }

    case "lead_ref":
    case "file":
      // No picker/upload UI yet — read-only until Sessions 9+ (import) and
      // a file storage flow exist. Showing the raw value beats hiding it.
      return (
        <Input value={defaultValue ? String(defaultValue) : "—"} disabled className="text-muted-foreground" />
      );

    case "email":
      return <Input type="email" name={name} defaultValue={(defaultValue as string) ?? ""} />;

    case "url":
      return <Input type="url" name={name} defaultValue={(defaultValue as string) ?? ""} />;

    case "phone":
      // A phone on a custom field or the profile form gets the same echo
      // the lead's own number gets — the E.164 it will actually be saved
      // as, which is how a nine-digit number gives itself away.
      return <PhoneInput name={name} defaultValue={(defaultValue as string) ?? ""} />;

    case "text":
    default:
      return <Input name={name} defaultValue={(defaultValue as string) ?? ""} />;
  }
}

function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toDateTimeInputValue(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}
