"use client";

import { UserMinus, UserPlus } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { assignStudentToBatch, removeStudentFromBatch, type BatchFormState } from "../actions";

const initialState: BatchFormState = {};

/**
 * Adding a student. The list offered is already narrowed to this centre's
 * students who are not in the batch — see the page — so a full picker
 * cannot produce the mistakes `checkAssignment` exists to catch.
 */
export function AddStudentForm({
  batchId,
  candidates,
}: {
  batchId: string;
  candidates: Array<{ id: string; label: string }>;
}) {
  const [state, action, pending] = useActionState(assignStudentToBatch, initialState);

  if (candidates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Every student at this centre is already in this batch, or there are none yet.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border p-4">
      <input type="hidden" name="batchId" value={batchId} />
      <div className="flex flex-wrap items-end gap-2">
        <Select name="studentId">
          <SelectTrigger className="h-9 w-72">
            <SelectValue placeholder="Choose a student" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={pending}>
          <UserPlus className="size-4" /> {pending ? "Adding…" : "Add to batch"}
        </Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

/**
 * Taking a student out. The reason is optional but worth asking for —
 * "left in August" and "left in August because they moved to Kannur" are
 * different answers to the same question later.
 */
export function RemoveStudentForm({
  batchId,
  studentId,
  studentName,
}: {
  batchId: string;
  studentId: string;
  studentName: string;
}) {
  const [state, action, pending] = useActionState(removeStudentFromBatch, initialState);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="studentId" value={studentId} />
      <div className="flex items-center gap-2">
        <Input name="reason" placeholder="Reason (optional)" className="h-8 w-44" />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-label={`Remove ${studentName} from this batch`}
        >
          <UserMinus className="size-4" />
        </Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
