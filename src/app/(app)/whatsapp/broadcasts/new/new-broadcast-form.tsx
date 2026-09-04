"use client";

import { useActionState, useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldOption } from "@/lib/fields/resolve-field-options";
import { NOT_SET, NOT_SET_LABEL, type PivotField } from "@/lib/reports/pivot";
import type { AudienceEntity } from "@/lib/whatsapp/audience";
import { cn } from "@/lib/utils";

import { createBroadcast, previewAudience, type AudiencePreview, type BroadcastFormState } from "../actions";

const initialState: BroadcastFormState = {};

/** shadcn's Select can't hold an empty-string item, so "no filter" needs a token of its own. */
const ANY = "__any__";

export interface AudienceFieldOptions {
  field: PivotField;
  options: FieldOption[];
}

export interface TemplateChoice {
  name: string;
  language: string;
  body: string;
  placeholders: number;
}

/**
 * The audience is the same grammar as the Insights filter bar — pick a
 * variable, pick a value, they AND together — because that is what Leon
 * asked for and because two different ways to say "Kannur, Meta, NIFT"
 * would eventually disagree.
 *
 * Nothing sends until the count has been looked at. A broadcast is
 * irreversible and billed per message, so the preview is a deliberate
 * step rather than a nicety: it says how many people, names a few of
 * them, and admits how many were dropped for having no number or being
 * marked do-not-contact.
 */
export function NewBroadcastForm({
  leadFields,
  studentFields,
  tags,
  templates,
}: {
  leadFields: AudienceFieldOptions[];
  studentFields: AudienceFieldOptions[];
  tags: Array<{ id: string; name: string }>;
  templates: TemplateChoice[];
}) {
  const [state, formAction, pending] = useActionState(createBroadcast, initialState);
  const [entity, setEntity] = useState<AudienceEntity>("lead");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [tagId, setTagId] = useState("");
  const [templateName, setTemplateName] = useState(templates[0]?.name ?? "");
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewing, startPreview] = useTransition();

  const fields = entity === "lead" ? leadFields : studentFields;
  const template = templates.find((t) => t.name === templateName) ?? null;
  const serialisedFilters = JSON.stringify(filters);

  function switchEntity(next: AudienceEntity) {
    setEntity(next);
    // A lead filter means nothing on a student and vice versa — the two
    // have different field definitions — so the filters reset rather than
    // silently carrying a key the new entity has never heard of.
    setFilters({});
    setTagId("");
    setPreview(null);
  }

  function setFilter(key: string, value: string) {
    setFilters((current) => {
      const next = { ...current };
      if (!value || value === ANY) delete next[key];
      else next[key] = value;
      return next;
    });
    setPreview(null);
  }

  function runPreview() {
    const data = new FormData();
    data.set("entity", entity);
    data.set("filters", serialisedFilters);
    if (tagId) data.set("tagId", tagId);
    startPreview(async () => setPreview(await previewAudience(data)));
  }

  const activeFilters = Object.keys(filters).length;

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      {/* The audience travels as hidden fields so the server resolves it
          from the same values the preview used. */}
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="filters" value={serialisedFilters} />
      <input type="hidden" name="tagId" value={tagId} />

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Who it goes to</h3>

        <div className="flex gap-1">
          {(["lead", "student"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => switchEntity(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                entity === value ? "bg-accent" : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {value === "lead" ? "Leads" : "Students"}
            </button>
          ))}
        </div>

        {entity === "lead" && tags.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Tag</Label>
            <Select
              value={tagId || ANY}
              onValueChange={(value) => {
                setTagId(value === ANY ? "" : value);
                setPreview(null);
              }}
            >
              <SelectTrigger className="h-8 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <details open={activeFilters > 0}>
          <summary className="cursor-pointer text-sm font-medium">
            Filters{activeFilters > 0 ? ` — ${activeFilters} active` : ""}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              every variable, ANDed together
            </span>
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map(({ field, options }) => (
              <div key={field.key} className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">{field.label}</Label>
                {options.length > 0 ? (
                  <Select
                    value={filters[field.key] ?? ANY}
                    onValueChange={(value) => setFilter(field.key, value)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Any</SelectItem>
                      <SelectItem value={NOT_SET}>{NOT_SET_LABEL}</SelectItem>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-8"
                    placeholder="contains…"
                    value={filters[field.key] ?? ""}
                    onChange={(event) => setFilter(field.key, event.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={runPreview} disabled={previewing}>
            {previewing ? "Counting…" : "Check the audience"}
          </Button>
          {preview && !preview.error && (
            <p className="text-sm">
              <span className="font-semibold">{preview.count}</span> will be messaged
              {preview.sample.length > 0 && (
                <span className="text-muted-foreground"> — {preview.sample.join(", ")}…</span>
              )}
            </p>
          )}
          {preview?.error && <p className="text-sm text-destructive">{preview.error}</p>}
        </div>

        {preview && !preview.error && (
          <p className="text-xs text-muted-foreground">
            {preview.noPhone > 0 && `${preview.noPhone} skipped for having no number. `}
            {preview.duplicatePhone > 0 &&
              `${preview.duplicatePhone} share a number with somebody already on the list and get one message between them. `}
            {preview.doNotContact > 0 &&
              `${preview.doNotContact} marked do-not-contact are excluded everywhere.`}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">What it says</h3>

        <div className="flex flex-col gap-2">
          <Label htmlFor="broadcast-name">Name (for your own records)</Label>
          <Input id="broadcast-name" name="name" required placeholder="Aug NIFT batch reminder" />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="broadcast-template">Template</Label>
          <Select name="templateName" value={templateName} onValueChange={setTemplateName}>
            <SelectTrigger id="broadcast-template">
              <SelectValue placeholder="Choose an approved template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((choice) => (
                <SelectItem key={`${choice.name}-${choice.language}`} value={choice.name}>
                  {choice.name} ({choice.language})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {template && (
            <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{template.body}</p>
          )}
        </div>

        <input type="hidden" name="templateLanguage" value={template?.language ?? "en_US"} />

        {template && template.placeholders > 0 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="broadcast-body-param">Value for {"{{1}}"}</Label>
            <Input id="broadcast-body-param" name="bodyParam" />
            {template.placeholders > 1 && (
              <p className="text-xs text-muted-foreground">
                This template asks for {template.placeholders} values but only the first can be
                filled in here — the rest would be blank. Use a template with one variable, or
                none, until per-recipient values are built.
              </p>
            )}
          </div>
        )}
      </section>

      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending || !templateName} className="w-fit">
        {pending ? "Queuing…" : preview && !preview.error ? `Send to ${preview.count}` : "Send"}
      </Button>
    </form>
  );
}
