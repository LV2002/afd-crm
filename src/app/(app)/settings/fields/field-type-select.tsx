"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { FIELD_TYPES } from "./constants";

export function FieldTypeSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <Select name="type" defaultValue={defaultValue ?? "text"} required>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FIELD_TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {type.replace(/_/g, " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
