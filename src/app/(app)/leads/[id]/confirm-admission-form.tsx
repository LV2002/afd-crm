"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { confirmAdmissionAction, type FormState } from "./actions";

const initialState: FormState = {};

/**
 * Gate 1, sales -> accounts. Irreversible via this form once submitted —
 * there is no "un-confirm" button, matching CLAUDE.md's "irreversible
 * without an admin override." A manual fee override is offered because
 * fee_structures coverage is admin-maintained and won't always have a row
 * for every course/mode/year combination from day one.
 */
export function ConfirmAdmissionForm({
  leadId,
  courses,
  modes,
}: {
  leadId: string;
  courses: FieldOption[];
  modes: FieldOption[];
}) {
  const [state, formAction, pending] = useActionState(confirmAdmissionAction.bind(null, leadId), initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Confirm admission</h3>
      <p className="text-xs text-muted-foreground">
        Creates the enrolment and hands this lead off to accounts. This can&apos;t be undone from here.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-course">Course</Label>
          <Select name="course" required>
            <SelectTrigger id="admission-course">
              <SelectValue placeholder="Select course" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-mode">Mode</Label>
          <Select name="mode" required>
            <SelectTrigger id="admission-mode">
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              {modes.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="admission-academic-year">Academic year</Label>
        <Input id="admission-academic-year" name="academicYear" placeholder="2026-27" required />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-discount">Discount (₹)</Label>
          <Input id="admission-discount" name="discount" type="number" min="0" step="1" placeholder="0" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-fee-override">Manual fee override (₹)</Label>
          <Input
            id="admission-fee-override"
            name="totalFeeOverride"
            type="number"
            min="0"
            step="1"
            placeholder="Leave blank to use fee structure"
          />
        </div>
      </div>

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Confirming…" : "Confirm admission"}
      </Button>
    </form>
  );
}
