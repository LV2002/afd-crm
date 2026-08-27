"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { FieldFormState } from "./actions";
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
  action,
  submitLabel,
}: {
  values: FieldFormValues;
  roles: Array<{ id: string; name: string }>;
  /** True for is_core fields: entity/key/type can't change. */
  locked: boolean;
  action: (prevState: FieldFormState, formData: FormData) => Promise<FieldFormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

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
          {locked ? (
            <>
              <Input value={values.type.replace(/_/g, " ")} disabled />
              <input type="hidden" name="type" value={values.type} />
            </>
          ) : (
            <FieldTypeSelect defaultValue={values.type} />
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
