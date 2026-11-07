"use client";

import { Check, Loader2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";

import { completeOnboarding, setOnboardingCheck, type OnboardingState } from "../onboarding/actions";

const initial: OnboardingState = {};

/**
 * The things that have to be done before this student counts as onboarded.
 * The list itself is set by an admin (Settings → Onboarding). Finishing is
 * only possible once every box is ticked.
 */
export function OnboardingChecklist({
  studentId,
  items,
  canEdit,
}: {
  studentId: string;
  items: Array<{ id: string; label: string; checked: boolean }>;
  canEdit: boolean;
}) {
  const [checked, setChecked] = useState(() => new Set(items.filter((i) => i.checked).map((i) => i.id)));
  const [message, setMessage] = useState<string | undefined>();
  const [, startTransition] = useTransition();
  const [state, action, pending] = useActionState(completeOnboarding, initial);
  const allDone = items.every((i) => checked.has(i.id));

  function toggle(id: string, next: boolean) {
    setMessage(undefined);
    setChecked((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
    startTransition(async () => {
      const result = await setOnboardingCheck(studentId, id, next);
      if (result.error) {
        setMessage(result.error);
        setChecked((prev) => {
          const copy = new Set(prev);
          if (next) copy.delete(id);
          else copy.add(id);
          return copy;
        });
      }
    });
  }

  return (
    <section className="flex max-w-2xl flex-col gap-3 rounded-lg border p-4 print:hidden">
      <div>
        <h2 className="text-lg font-semibold">Onboarding checklist</h2>
        <p className="text-sm text-muted-foreground">
          {checked.size} of {items.length} done. Onboarding can be marked complete once every item is ticked.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No checklist items are set up, so onboarding can be completed straight away.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={checked.has(item.id)}
                  disabled={!canEdit}
                  onChange={(e) => toggle(item.id, e.target.checked)}
                />
                <span>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="studentId" value={studentId} />
          <div>
            <Button type="submit" disabled={pending || !allDone}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {pending ? "Saving…" : "Mark onboarding complete"}
            </Button>
          </div>
        </form>
      )}
      <FormMessage error={message ?? state.error} success={state.success} />
    </section>
  );
}
