"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { createLeadManually, type FormState } from "./actions";
import { StateDistrictFields } from "../[id]/state-district-fields";

const initialState: FormState = {};

/**
 * Deliberately only the fields a person walking in or calling in would
 * give you up front — core identity, contact and interest. Everything
 * else (custom fields, stage, temperature) is set from the edit page
 * once the lead exists; resolveOrCreateLead()/applyAssignment() decide
 * stage and assignment automatically, same as every other ingestion path.
 */
export function LeadCreateForm({
  centers,
  examOptions,
  courseOptions,
  showCenterPicker,
}: {
  centers: FieldOption[];
  examOptions: FieldOption[];
  courseOptions: FieldOption[];
  showCenterPicker: boolean;
}) {
  const [state, formAction, pending] = useActionState(createLeadManually, initialState);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="studentName">Student name</Label>
          <Input id="studentName" name="studentName" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="primaryPhone">Primary phone</Label>
          <Input id="primaryPhone" name="primaryPhone" required placeholder="98471 23456" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fatherName">Father&apos;s name</Label>
          <Input id="fatherName" name="fatherName" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="examYear">Exam year</Label>
          <Input id="examYear" name="examYear" placeholder="2027" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StateDistrictFields stateName="state" districtName="district" defaultState="" defaultDistrict="" />
      </div>

      {showCenterPicker && (
        <div className="flex flex-col gap-2 sm:w-64">
          <Label htmlFor="centerId">Centre</Label>
          <Select name="centerId">
            <SelectTrigger id="centerId">
              <SelectValue placeholder="Select a centre" />
            </SelectTrigger>
            <SelectContent>
              {centers.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>Interested exams</Label>
        <div className="flex flex-wrap gap-3">
          {examOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm font-normal">
              <Checkbox name="interestedExams" value={option.value} />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Courses interested</Label>
        <div className="flex flex-wrap gap-3">
          {courseOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm font-normal">
              <Checkbox name="coursesInterested" value={option.value} />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating…" : "Create lead"}
      </Button>
    </form>
  );
}
