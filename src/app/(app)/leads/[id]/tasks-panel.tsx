"use client";

import { useActionState, useTransition } from "react";
import { Check } from "lucide-react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateIST } from "@/lib/format/date";

import { completeTask, createTask, type FormState } from "./actions";

export interface TaskRow {
  id: string;
  title: string;
  type: string | null;
  due_at: string | null;
  status: "open" | "done" | "cancelled";
}

const initialState: FormState = {};

export function TasksPanel({ leadId, tasks }: { leadId: string; tasks: TaskRow[] }) {
  const [state, formAction, pending] = useActionState(createTask.bind(null, leadId), initialState);
  const [isCompleting, startCompleting] = useTransition();

  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status !== "open");

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Tasks</h3>

      {open.length === 0 && done.length === 0 && (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      )}

      {open.map((task) => (
        <div key={task.id} className="flex items-center justify-between gap-2 text-sm">
          <div>
            <p>{task.title}</p>
            {task.due_at && (
              <p className="text-xs text-muted-foreground">Due {formatDateIST(task.due_at, "d MMM yyyy")}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isCompleting}
            onClick={() => startCompleting(() => completeTask(task.id, leadId))}
          >
            <Check /> Done
          </Button>
        </div>
      ))}

      {done.length > 0 && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">{done.length} completed</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {done.map((task) => (
              <li key={task.id} className="line-through">
                {task.title}
              </li>
            ))}
          </ul>
        </details>
      )}

      <form action={formAction} className="flex flex-col gap-2 border-t pt-3">
        <div className="flex gap-2">
          <Input name="title" placeholder="New task…" required className="flex-1" />
          <Input name="dueAt" type="date" className="w-40" />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
        <FormMessage error={state.error} success={state.success} />
      </form>
    </div>
  );
}
