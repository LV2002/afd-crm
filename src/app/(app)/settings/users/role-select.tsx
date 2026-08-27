"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function RoleSelect({
  name,
  roles,
  defaultValue,
}: {
  name: string;
  roles: Array<{ id: string; name: string }>;
  defaultValue?: string;
}) {
  return (
    <Select name={name} defaultValue={defaultValue} required>
      <SelectTrigger>
        <SelectValue placeholder="Select a role" />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
