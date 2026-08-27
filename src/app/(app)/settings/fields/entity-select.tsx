"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { FIELD_ENTITIES } from "./constants";

export function EntitySelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <Select name="entity" defaultValue={defaultValue ?? "lead"} required>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FIELD_ENTITIES.map((entity) => (
          <SelectItem key={entity} value={entity} className="capitalize">
            {entity}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
