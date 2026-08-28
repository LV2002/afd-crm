"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

/**
 * Renders the right input for a field's *type* — one place that decides
 * "text box vs dropdown vs checkboxes", so a brand-new custom field of an
 * existing type edits correctly with no new code. Phone-type fields are
 * deliberately never handled here: see lead-edit-form.tsx for why.
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
    case "currency":
      return <Input type="number" name={name} defaultValue={(defaultValue as number) ?? ""} />;

    case "select":
    case "user_ref":
      return (
        <Select name={name} defaultValue={(defaultValue as string) ?? undefined}>
          <SelectTrigger>
            <SelectValue placeholder={field.label} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "multiselect": {
      const current = Array.isArray(defaultValue) ? (defaultValue as string[]) : [];
      return (
        <div className="flex flex-col gap-1.5">
          {options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm font-normal">
              <Checkbox name={name} value={option.value} defaultChecked={current.includes(option.value)} />
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

    case "text":
    case "phone":
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
