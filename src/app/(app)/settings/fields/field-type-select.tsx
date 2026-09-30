"use client";

import { Combobox } from "@/components/ui/combobox";

import { FIELD_TYPE_OPTIONS } from "./constants";

export function FieldTypeSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <Combobox
      name="type"
      defaultValue={defaultValue ?? "text"}
      required
      options={FIELD_TYPE_OPTIONS}
      placeholder="Choose a type"
      searchPlaceholder="Search — try “upload”, “dropdown”, “money”…"
    />
  );
}
