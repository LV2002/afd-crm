"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { archiveList, createList, updateList, type DatabaseFormState } from "../actions";

const initial: DatabaseFormState = {};

export interface ListValues {
  id?: string;
  name: string;
  source: string;
  description: string;
  centerId: string;
  useForAds: boolean;
  useForWhatsapp: boolean;
}

export function ListForm({
  values,
  sources,
  centers,
  canManage,
}: {
  values: ListValues;
  sources: Array<{ value: string; label: string }>;
  centers: Array<{ value: string; label: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(values.id ? updateList : createList, initial);
  const [archiving, startArchive] = useTransition();
  const select = "h-10 rounded-md border border-input bg-card px-3 text-sm disabled:opacity-60";

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="List name" htmlFor={`name-${values.id ?? "new"}`} required>
          <Input id={`name-${values.id ?? "new"}`} name="name" defaultValue={values.name} required disabled={!canManage} placeholder="St Xavier's seminar, Nov 2026" />
        </Field>
        <Field label="Where they came from" hint="Becomes the lead's source if one of them is moved into the leads.">
          <select name="source" defaultValue={values.source} className={select} disabled={!canManage}>
            <option value="">Not set</option>
            {sources.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Centre (optional)">
          <select name="centerId" defaultValue={values.centerId} className={select} disabled={!canManage}>
            <option value="">Any</option>
            {centers.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <Input name="description" defaultValue={values.description} disabled={!canManage} placeholder="e.g. 12th-class aptitude test, 180 students" />
        </Field>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="useForAds" defaultChecked={values.useForAds} disabled={!canManage} />
          May be used for Meta and Google retargeting
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="useForWhatsapp" defaultChecked={values.useForWhatsapp} disabled={!canManage} />
          These people agreed to WhatsApp messages
          <span className="text-muted-foreground">
            — recorded now; sending broadcasts to the database is not switched on yet, and will only ever use lists with this ticked
          </span>
        </label>
      </div>

      {canManage && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} size="sm">
            {pending ? "Saving…" : values.id ? "Save" : "Create the list"}
          </Button>
          {values.id && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={archiving}
              onClick={() => {
                if (!window.confirm("Archive this list? Its people stay in the database; the list just stops being offered.")) return;
                startArchive(async () => {
                  await archiveList(values.id as string);
                  router.refresh();
                });
              }}
            >
              Archive
            </Button>
          )}
          <FormMessage error={state.error} success={state.success} />
        </div>
      )}
    </form>
  );
}
