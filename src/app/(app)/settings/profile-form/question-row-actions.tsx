"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { moveQuestion, setQuestionOnForm, setQuestionRequired } from "./actions";

/**
 * Small in-row controls, so composing the form is direct manipulation
 * rather than a trip through an edit page per question. Each one calls a
 * Server Action and refreshes; the row order and the switches all come
 * from the server, so nothing here holds optimistic state that could
 * disagree with the database.
 */
function useRowAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.error) window.alert(result.error);
      router.refresh();
    });
  }

  return { isPending, run };
}

export function RequiredSwitch({
  fieldId,
  isRequired,
}: {
  fieldId: string;
  isRequired: boolean;
}) {
  const { isPending, run } = useRowAction();
  return (
    <div className="flex justify-center">
      <Switch
        checked={isRequired}
        disabled={isPending}
        onCheckedChange={(checked) => run(() => setQuestionRequired(fieldId, checked))}
        aria-label="Required"
      />
    </div>
  );
}

export function PlacementControls({
  fieldId,
  onForm,
  isFirst,
  isLast,
}: {
  fieldId: string;
  onForm: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const { isPending, run } = useRowAction();

  return (
    <div className="flex items-center justify-end gap-1">
      {onForm && (
        <>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending || isFirst}
            onClick={() => run(() => moveQuestion(fieldId, "up"))}
            aria-label="Move up"
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending || isLast}
            onClick={() => run(() => moveQuestion(fieldId, "down"))}
            aria-label="Move down"
          >
            <ChevronDown className="size-4" />
          </Button>
        </>
      )}
      <Switch
        checked={onForm}
        disabled={isPending}
        onCheckedChange={(checked) => run(() => setQuestionOnForm(fieldId, checked))}
        aria-label="On the form"
      />
    </div>
  );
}
