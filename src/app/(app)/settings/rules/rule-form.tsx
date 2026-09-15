"use client";

import { FlaskConical, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { ConditionBuilder, type ConditionFieldOptions } from "@/components/rules/condition-builder";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Condition, ConditionField } from "@/lib/assignment/evaluate-conditions";

import { createAssignmentRule, previewAssignmentRule, updateAssignmentRule, type RuleFormState } from "./actions";

const initialState: RuleFormState = {};

export interface RuleFormValues {
  name: string;
  isActive: boolean;
  appliesOn: string[];
  conditions: Condition[];
  strategy: "fixed" | "round_robin";
  assignTo: string;
  userIds: string[];
  centerId: string;
}

export interface UserOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * The rule editor.
 *
 * CLAUDE.md non-negotiable #4: "Adding 'assign Kannur + Meta + NIFT to
 * Athira' must require zero schema changes." It never did — but until now
 * it required an INSERT typed into a SQL client, because the engine
 * shipped with no screen. This is that screen.
 *
 * The dry run beside the save button is the part that earns its keep: it
 * answers "would this have caught anything?" against the last 200 real
 * leads before the rule goes anywhere near an incoming one.
 */
export function RuleForm({
  ruleId,
  values,
  users,
  centers,
  fields,
  optionsByField,
}: {
  ruleId?: string;
  values: RuleFormValues;
  users: UserOption[];
  centers: Array<{ value: string; label: string }>;
  fields: ConditionField[];
  optionsByField: ConditionFieldOptions;
}) {
  const router = useRouter();
  const action = ruleId ? updateAssignmentRule.bind(null, ruleId) : createAssignmentRule;
  const [state, formAction, pending] = useActionState(action, initialState);

  const [strategy, setStrategy] = React.useState(values.strategy);
  const [chosen, setChosen] = React.useState<string[]>(values.userIds);
  const formRef = React.useRef<HTMLFormElement>(null);

  const [preview, setPreview] = React.useState<string | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  React.useEffect(() => {
    if (state.success && !ruleId) router.push("/settings/rules");
  }, [state.success, ruleId, router]);

  async function runPreview() {
    const form = formRef.current;
    if (!form) return;
    setPreviewing(true);
    setPreview(null);
    const conditions = String(new FormData(form).get("conditions") ?? "");
    const result = await previewAssignmentRule(conditions);
    setPreviewing(false);
    if (result.error) {
      setPreview(result.error);
    } else if (result.sampled === 0) {
      setPreview("There are no leads yet to test this against.");
    } else {
      setPreview(
        `Would have matched ${result.matched} of the last ${result.sampled} leads.` +
          (result.matched === 0 ? " Nothing would reach this rule as written." : ""),
      );
    }
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <Field
          label="Name"
          htmlFor="name"
          required
          hint="What it does, in your words — 'Kannur Meta leads to Athira'."
        >
          <Input id="name" name="name" defaultValue={values.name} required autoComplete="off" />
        </Field>

        <div className="flex flex-col gap-2">
          <Label>Run this rule when a lead is</Label>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem]">
              <Checkbox
                name="appliesOn"
                value="create"
                defaultChecked={values.appliesOn.includes("create")}
                className="size-5"
              />
              created
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem]">
              <Checkbox
                name="appliesOn"
                value="update"
                defaultChecked={values.appliesOn.includes("update")}
                className="size-5"
              />
              updated
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            Almost always just <strong>created</strong>. Adding <strong>updated</strong> means the
            lead can be taken off one counsellor and given to another when somebody edits it.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Switch id="isActive" name="isActive" defaultChecked={values.isActive} />
          <Label htmlFor="isActive">Active</Label>
          <span className="text-sm text-muted-foreground">
            An inactive rule is skipped entirely — leads fall through to the next one.
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
        <div>
          <h3 className="text-sm font-semibold">Which leads</h3>
          <p className="text-sm text-muted-foreground">
            Every condition has to be true. Leave it empty and the rule catches everything.
          </p>
        </div>
        <ConditionBuilder
          defaultConditions={values.conditions}
          fields={fields}
          optionsByField={optionsByField}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={runPreview} disabled={previewing}>
            <FlaskConical className="size-4" />
            {previewing ? "Checking…" : "Test against recent leads"}
          </Button>
          {preview && <p className="text-sm text-muted-foreground">{preview}</p>}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <div>
          <h3 className="text-sm font-semibold">Who gets them</h3>
          <p className="text-sm text-muted-foreground">
            A rule that matches but assigns nobody swallows the lead — it never reaches the rules
            below it. So this cannot be left blank.
          </p>
        </div>

        <Field label="How" htmlFor="strategy" className="sm:max-w-xs">
          <Combobox
            id="strategy"
            name="strategy"
            value={strategy}
            onChange={(value) => setStrategy(value as "fixed" | "round_robin")}
            options={[
              { value: "fixed", label: "One person", hint: "Always the same counsellor" },
              { value: "round_robin", label: "Share out in turn", hint: "Round robin between several" },
            ]}
          />
        </Field>

        {strategy === "fixed" ? (
          <Field label="Assign to" htmlFor="assignTo" required className="sm:max-w-md">
            <Combobox
              id="assignTo"
              name="assignTo"
              defaultValue={values.assignTo}
              options={users}
              placeholder="Choose a person"
            />
          </Field>
        ) : (
          <div className="flex flex-col gap-2">
            <Label>Share between</Label>
            <div className="flex flex-col gap-1 rounded-md border p-3 sm:max-w-md">
              {users.map((user) => (
                <label key={user.value} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem]">
                  <Checkbox
                    name="userIds"
                    value={user.value}
                    defaultChecked={values.userIds.includes(user.value)}
                    onCheckedChange={(checked) =>
                      setChosen((current) =>
                        checked
                          ? [...current, user.value]
                          : current.filter((id) => id !== user.value),
                      )
                    }
                    className="size-5"
                  />
                  <span>
                    {user.label}
                    {user.hint && <span className="ml-2 text-xs text-muted-foreground">{user.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {chosen.length < 2
                ? "Pick at least two — one person is not a rotation."
                : `In turn between ${chosen.length} people. Somebody deactivated is skipped, not stalled on.`}
            </p>
          </div>
        )}

        <Field
          label="Also move them to"
          htmlFor="centerId"
          hint="Leave blank to keep whichever centre the lead already has."
          className="sm:max-w-md"
        >
          <Combobox
            id="centerId"
            name="centerId"
            defaultValue={values.centerId}
            options={centers}
            placeholder="Leave the centre alone"
            clearable
          />
        </Field>
      </section>

      <FormMessage error={state.error} success={state.success} />

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          <Save className="size-4" />
          {pending ? "Saving…" : ruleId ? "Save changes" : "Create rule"}
        </Button>
        {!ruleId && (
          <p className="text-sm text-muted-foreground">
            New rules go to the bottom of the list, so they only catch what nothing above them did.
          </p>
        )}
      </div>
    </form>
  );
}
