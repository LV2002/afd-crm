"use client";

import { UserPlus } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/smart-inputs";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { createLeadManually, type FormState } from "./actions";
import { StateDistrictFields } from "../[id]/state-district-fields";

const initialState: FormState = {};

/**
 * The exam years anybody is realistically entering.
 *
 * This was a free-text box with the placeholder "2027", which is how you
 * get "27", "2072" and "next year" in the same column and every cohort
 * report split four ways. The list runs from last year (a repeat student
 * who sat it already) to four years out (a school student planning
 * ahead), which covers every real answer.
 */
function examYearOptions(): FieldOption[] {
  const thisYear = new Date().getFullYear();
  const years: FieldOption[] = [];
  for (let year = thisYear - 1; year <= thisYear + 4; year += 1) {
    years.push({ value: String(year), label: String(year) });
  }
  return years;
}

/**
 * Deliberately only the fields a person walking in or calling in would
 * give you up front — core identity, contact and interest. Everything
 * else (custom fields, stage, temperature) is set from the edit page
 * once the lead exists; resolveOrCreateLead()/applyAssignment() decide
 * stage and assignment automatically, same as every other ingestion path.
 *
 * Every field that has a known set of answers now offers them. The only
 * free text left is a name, an email and a city — the three things that
 * genuinely cannot be listed in advance.
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
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Who they are
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Student name" htmlFor="studentName" required>
            <Input id="studentName" name="studentName" required autoComplete="off" autoFocus />
          </Field>

          <Field
            label="Primary phone"
            htmlFor="primaryPhone"
            required
            hint="This is how we find them again — everything else hangs off it."
          >
            <PhoneInput id="primaryPhone" name="primaryPhone" required />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Father's name" htmlFor="fatherName">
            <Input id="fatherName" name="fatherName" autoComplete="off" />
          </Field>

          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="off" />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Where they are
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <StateDistrictFields
            stateName="state"
            districtName="district"
            defaultState=""
            defaultDistrict=""
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City or town" htmlFor="city">
            <Input id="city" name="city" autoComplete="off" placeholder="Kochi" />
          </Field>

          {showCenterPicker && (
            <Field
              label="Centre"
              htmlFor="centerId"
              hint="Leave blank and the assignment rules decide."
            >
              <Combobox
                id="centerId"
                name="centerId"
                options={centers}
                placeholder="Choose a centre"
                clearable
              />
            </Field>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          What they want
        </h3>

        <Field
          label="Exam year"
          htmlFor="examYear"
          hint="The year they will sit the exam, not the year they are in now."
          className="sm:max-w-xs"
        >
          <Combobox
            id="examYear"
            name="examYear"
            options={examYearOptions()}
            placeholder="Choose a year"
            clearable
          />
        </Field>

        <div className="flex flex-col gap-2">
          <Label>Interested exams</Label>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {examOptions.map((option) => (
              <label
                key={option.value}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem] font-normal"
              >
                <Checkbox name="interestedExams" value={option.value} className="size-5" />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Courses interested</Label>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {courseOptions.map((option) => (
              <label
                key={option.value}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem] font-normal"
              >
                <Checkbox name="coursesInterested" value={option.value} className="size-5" />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </section>

      <FormMessage error={state.error} />

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          <UserPlus className="size-4" />
          {pending ? "Creating…" : "Create lead"}
        </Button>
        <p className="text-sm text-muted-foreground">
          If they already exist, this won&rsquo;t be refused — the two records get flagged for
          merging.
        </p>
      </div>
    </form>
  );
}
