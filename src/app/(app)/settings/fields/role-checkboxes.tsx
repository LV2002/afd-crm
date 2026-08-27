"use client";

import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function RoleCheckboxes({
  name,
  roles,
  defaultCheckedIds = [],
}: {
  name: string;
  roles: Array<{ id: string; name: string }>;
  defaultCheckedIds?: string[];
}) {
  const idPrefix = useId();

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {roles.map((role) => {
        const inputId = `${idPrefix}-${role.id}`;
        return (
          <div key={role.id} className="flex items-center gap-2">
            <Checkbox
              id={inputId}
              name={name}
              value={role.id}
              defaultChecked={defaultCheckedIds.includes(role.id)}
            />
            <Label htmlFor={inputId} className="font-normal">
              {role.name}
            </Label>
          </div>
        );
      })}
    </div>
  );
}
