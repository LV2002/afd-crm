"use client";

import { Combobox } from "@/components/ui/combobox";

/**
 * Roles are database rows an admin creates, so this list has no ceiling —
 * which is why it is searchable rather than a plain dropdown.
 */
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
    <Combobox
      name={name}
      defaultValue={defaultValue}
      required
      options={roles.map((role) => ({ value: role.id, label: role.name }))}
      placeholder="Select a role"
      searchPlaceholder="Type a role…"
    />
  );
}
