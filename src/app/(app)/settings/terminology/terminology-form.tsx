"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TerminologyKey, TerminologyMap } from "@/lib/terminology/terms";

import { updateTerminology, type TerminologyState } from "./actions";

const ROW_HELP: Record<TerminologyKey, string> = {
  lead: "A prospective student",
  student: "The academic record created at enrolment",
  counsellor: "Sales rep who owns leads",
  center: "A physical branch",
  course: "e.g. Foundation, DWO, DAO",
  exam: "e.g. NID, NIFT, UCEED",
};

const initialState: TerminologyState = {};

export function TerminologyForm({
  map,
  keys,
}: {
  map: TerminologyMap;
  keys: readonly TerminologyKey[];
}) {
  const [state, formAction, pending] = useActionState(updateTerminology, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {keys.map((key) => (
          <div key={key} className="flex flex-col gap-2 rounded-lg border p-4">
            <span className="text-sm font-medium capitalize">{key}</span>
            <span className="text-xs text-muted-foreground">{ROW_HELP[key]}</span>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${key}.singular`} className="text-xs text-muted-foreground">
                Singular
              </Label>
              <Input
                id={`${key}.singular`}
                name={`${key}.singular`}
                defaultValue={map[key].singular}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${key}.plural`} className="text-xs text-muted-foreground">
                Plural
              </Label>
              <Input
                id={`${key}.plural`}
                name={`${key}.plural`}
                defaultValue={map[key].plural}
                required
              />
            </div>
          </div>
        ))}
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
