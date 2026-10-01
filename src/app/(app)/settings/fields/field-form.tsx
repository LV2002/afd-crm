"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { FieldFormState } from "./actions";
import { FIELD_TYPE_LABELS, type FieldTypeName } from "./constants";
import { EntitySelect } from "./entity-select";
import { FieldTypeSelect } from "./field-type-select";
import { RoleCheckboxes } from "./role-checkboxes";

export interface FieldFormValues {
  entity: string;
  key: string;
  label: string;
  helpText: string;
  type: string;
  section: string;
  isRequired: boolean;
  showInList: boolean;
  showInFilters: boolean;
  optionsLines: string;
  visibleToRoleIds: string[];
  editableByRoleIds: string[];
}

const initialState: FieldFormState = {};

export function FieldForm({
  values,
  roles,
  locked,
  answeredCount = 0,
  action,
  submitLabel,
}: {
  values: FieldFormValues;
  roles: Array<{ id: string; name: string }>;
  /** True for is_core fields: entity/key/type can't change. */
  locked: boolean;
  /**
   * How many people have answered this question. Non-zero freezes the type,
   * because there is no honest way to reinterpret existing answers as a
   * different type — see `countFieldAnswers`. Zero on a new field.
   */
  answeredCount?: number;
  action: (prevState: FieldFormState, formData: FormData) => Promise<FieldFormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  // Only a built-in field's type is truly fixed — it is a real column, not a
  // value in a jsonb blob. A custom field's type can change at any time; what
  // changes with answers is how much warning the form gives.
  const typeFrozen = locked;
  const typeLabel =
    FIELD_TYPE_LABELS[values.type as FieldTypeName]?.label ?? values.type.replace(/_/g, " ");

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="entity">Entity</Label>
          {locked ? (
            <>
              <Input value={values.entity} disabled className="capitalize" />
              <input type="hidden" name="entity" value={values.entity} />
            </>
          ) : (
            <EntitySelect defaultValue={values.entity} />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="key">Key</Label>
          {locked ? (
            <>
              <Input value={values.key} disabled />
              <input type="hidden" name="key" value={values.key} />
            </>
          ) : (
            <Input id="key" name="key" defaultValue={values.key} placeholder="preferred_shift" required />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="label">Label</Label>
        <Input id="label" name="label" defaultValue={values.label} required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="helpText">Help text</Label>
        <Input id="helpText" name="helpText" defaultValue={values.helpText} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">Type</Label>
          {typeFrozen ? (
            <>
              <Input value={typeLabel} disabled />
              <input type="hidden" name="type" value={values.type} />
            </>
          ) : (
            <FieldTypeSelect defaultValue={values.type} />
          )}
          {/*
            Said on the form rather than only on a refusal. Somebody who
            picked the wrong type can fix it while nobody has answered, and
            wants to know that before they try; somebody who cannot needs
            the reason, not a greyed-out box with no explanation.
          */}
          <p className="text-xs text-muted-foreground">
            {locked
              ? "A built-in field. Its type is fixed."
              : answeredCount === 0
                ? "Nobody has answered this yet, so the type can be changed freely."
                : `${answeredCount} ${answeredCount === 1 ? "person has" : "people have"} answered this already. You can still change the type — see below.`}
          </p>
          {/*
            The tick is only here when it is needed, and it says what actually
            happens rather than "are you sure?". Nothing is destroyed: the
            stored answers stay, and every screen falls back to printing a
            value it cannot interpret as plain text. What cannot happen is the
            conversion, and that is the sentence an admin needs.
          */}
          {!locked && answeredCount > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-dashed p-3">
              <div className="flex items-start gap-2">
                <Checkbox id="confirmTypeChange" name="confirmTypeChange" className="mt-0.5" />
                <Label htmlFor="confirmTypeChange" className="font-normal leading-snug">
                  Yes, change the type even though {answeredCount === 1 ? "somebody has" : "people have"}{" "}
                  answered
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                The {answeredCount} existing {answeredCount === 1 ? "answer" : "answers"} stay on the
                record and stay readable, but they cannot be converted. If this becomes a file
                upload, those people would need to send the file again — the old text remains
                visible on their record either way. Nothing is deleted, and the change is logged.
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="section">Section</Label>
          <Input id="section" name="section" defaultValue={values.section} placeholder="Personal" required />
        </div>
      </div>

      {(values.type === "select" || values.type === "multiselect") && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="options">Options (one per line, value:label)</Label>
          <Textarea
            id="options"
            name="options"
            className="font-mono text-xs"
            rows={4}
            defaultValue={values.optionsLines}
            placeholder={"morning:Morning\nevening:Evening"}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox id="isRequired" name="isRequired" defaultChecked={values.isRequired} />
          <Label htmlFor="isRequired" className="font-normal">
            Required
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="showInList" name="showInList" defaultChecked={values.showInList} />
          <Label htmlFor="showInList" className="font-normal">
            Show in list view
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="showInFilters" name="showInFilters" defaultChecked={values.showInFilters} />
          <Label htmlFor="showInFilters" className="font-normal">
            Show in filters
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Visible to roles (empty = everyone)</Label>
        <RoleCheckboxes name="visibleToRoles" roles={roles} defaultCheckedIds={values.visibleToRoleIds} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Editable by roles (empty = everyone who can see it)</Label>
        <RoleCheckboxes name="editableByRoles" roles={roles} defaultCheckedIds={values.editableByRoleIds} />
      </div>

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
