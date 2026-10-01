"use client";

import { Check, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";

import { completeOnboarding, type OnboardingState } from "./actions";

const initial: OnboardingState = {};

/**
 * One button per student in the queue.
 *
 * No confirmation dialog. The action is additive and one-way, but it is not
 * destructive — the worst case of an accidental click is a student on the
 * roster a day early, which is a smaller cost than a dialog on every row of
 * a queue somebody is working through twenty at a time.
 */
export function OnboardButton({ studentId, name }: { studentId: string; name: string }) {
  const [state, action, pending] = useActionState(completeOnboarding, initial);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="studentId" value={studentId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {pending ? "Saving…" : "Onboarding done"}
      </Button>
      {state.error && <FormMessage error={state.error} />}
      {/*
        On success the row leaves the list, so this is almost never seen —
        it is here for the case where the revalidation lands late and the
        person is left looking at a row they have already dealt with.
      */}
      {state.success && <FormMessage success={`${name} is onboarded.`} />}
    </form>
  );
}
