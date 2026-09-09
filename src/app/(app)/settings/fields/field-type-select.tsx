"use client";

import { Combobox } from "@/components/ui/combobox";

import { FIELD_TYPES } from "./constants";

export function FieldTypeSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <Combobox
      name="type"
      defaultValue={defaultValue ?? "text"}
      required
      options={FIELD_TYPES.map((type) => ({ value: type, label: type.replace(/_/g, " ") }))}
      placeholder="Choose a type"
      searchPlaceholder="Type to search…"
    />
  );
}
