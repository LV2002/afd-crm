"use client";

import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function CenterCheckboxes({
  centers,
  defaultCheckedIds = [],
}: {
  centers: Array<{ id: string; name: string }>;
  defaultCheckedIds?: string[];
}) {
  const idPrefix = useId();

  return (
    <div className="flex flex-col gap-2">
      {centers.map((center) => {
        const inputId = `${idPrefix}-${center.id}`;
        return (
          <div key={center.id} className="flex items-center gap-2">
            <Checkbox
              id={inputId}
              name="centerIds"
              value={center.id}
              defaultChecked={defaultCheckedIds.includes(center.id)}
            />
            <Label htmlFor={inputId} className="font-normal">
              {center.name}
            </Label>
          </div>
        );
      })}
    </div>
  );
}
