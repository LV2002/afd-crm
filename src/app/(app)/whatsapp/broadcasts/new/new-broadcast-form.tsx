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
import { WHATSAPP_MEDIA_EXTENSIONS } from "@/lib/whatsapp/media";
import { MERGE_VARIABLES, mergeVariablesFor } from "@/lib/whatsapp/merge-variables";
import { fillTemplateBody, resolveParams, type ParamSource } from "@/lib/whatsapp/personalise";
import { SWEEP_CADENCE_NOTE, defaultScheduleValue } from "@/lib/whatsapp/schedule";
import { cn } from "@/lib/utils";

import {
  createBroadcast,
  previewAudience,
  type AudiencePreview,
  type BroadcastFormState,
} from "../actions";

const initialState: BroadcastFormState = {};

/** shadcn's Select can't hold an empty-string item, so "no filter" needs a token of its own. */
const ANY = "__any__";

/** The same token trick for "this placeholder is fixed text, not a variable". */
const FIXED_TEXT = "__text__";

/**
 * Stand-in values for the live preview before anybody has pressed "Check
 * the audience". Showing "Hi {{1}}" while somebody is choosing what {{1}}
 * means is useless; showing "Hi Anjali" makes the choice obvious. Once
 * the audience has been checked these are replaced by the first real
 * recipient's own values, so the last thing read before sending is a
 * message that genuinely exists.
 */
const EXAMPLE_VALUES: Record<string, string> = Object.fromEntries(
  MERGE_VARIABLES.map((variable) => [variable.key, variable.example]),
);

export interface AudienceFieldOptions {
  field: PivotField;
  options: FieldOption[];
}

export interface TemplateChoice {
  name: string;
  language: string;
  body: string;
  placeholders: number;
  /** Set when the template was approved with an image, video or document header. */
  headerMediaKind: "image" | "video" | "document" | null;
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
  const [sources, setSources] = useState<ParamSource[]>([]);
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduledAt, setScheduledAt] = useState("");

  const fields = entity === "lead" ? leadFields : studentFields;
  const template = templates.find((t) => t.name === templateName) ?? null;
  const serialisedFilters = JSON.stringify(filters);
  const variables = mergeVariablesFor(entity);

  // One source per placeholder the chosen template actually has. A
  // template with three variables and two sources would send the course
  // where the name belongs, so the array is padded rather than trusted.
  const placeholderCount = template?.placeholders ?? 0;
  const paramSources: ParamSource[] = Array.from(
    { length: placeholderCount },
    (_, index) => sources[index] ?? { kind: "text", value: "" },
  );
  const serialisedSources = JSON.stringify(paramSources);

  // The message as one real person will read it. Before the audience has
  // been checked these are stand-in examples; after, they are the first
  // recipient's own values.
  const previewValues = preview?.sampleValues ?? EXAMPLE_VALUES;
  const filledBody = template
    ? fillTemplateBody(template.body, resolveParams(paramSources, previewValues).params)
    : "";

  function setSource(index: number, next: ParamSource) {
    setSources((current) => {
      const copy: ParamSource[] = Array.from(
        { length: placeholderCount },
        (_, i) => current[i] ?? { kind: "text", value: "" },
      );
      copy[index] = next;
      return copy;
    });
  }

  /**
   * A variable that resolves to nothing for one person still has to send
   * something — Meta rejects an empty parameter outright — so the
   * fallback is required, and pre-filled with something that reads like a
   * sentence rather than left blank for somebody to forget.
   */
  function chooseVariable(index: number, key: string) {
    if (key === FIXED_TEXT) {
      setSource(index, { kind: "text", value: "" });
      return;
    }
    const existing = paramSources[index];
    const fallback =
      existing?.kind === "variable" && existing.fallback
        ? existing.fallback
        : key === "first_name" || key === "full_name"
          ? "there"
          : "";
    setSource(index, { kind: "variable", key, fallback });
  }

  function switchEntity(next: AudienceEntity) {
    setEntity(next);
    // A lead filter means nothing on a student and vice versa — the two
    // have different field definitions — so the filters reset rather than
    // silently carrying a key the new entity has never heard of.
    setFilters({});
    setTagId("");
    setPreview(null);
    // A student has no counsellor and a lead has no batch, so a variable
    // chosen for one entity can be meaningless on the other. Rather than
    // silently sending the fallback to everybody, those placeholders drop
    // back to fixed text and have to be chosen again.
    setSources((current) =>
      current.map((source) =>
        source.kind === "variable" &&
        !mergeVariablesFor(next).some((variable) => variable.key === source.key)
          ? { kind: "text", value: "" }
          : source,
      ),
    );
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
    data.set("bodyParams", serialisedSources);
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
      <input type="hidden" name="bodyParams" value={serialisedSources} />
      <input type="hidden" name="sendMode" value={sendMode} />

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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runPreview}
            disabled={previewing}
          >
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

        {template?.headerMediaKind && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="broadcast-header-media">
              {template.headerMediaKind === "image"
                ? "Header image"
                : template.headerMediaKind === "video"
                  ? "Header video"
                  : "Header document"}
            </Label>
            <Input
              id="broadcast-header-media"
              name="headerMedia"
              type="file"
              accept={WHATSAPP_MEDIA_EXTENSIONS}
              required
            />
            <p className="text-xs text-muted-foreground">
              This template was approved with a {template.headerMediaKind} header, so every message
              carries one. It is uploaded once and reused for the whole audience.
              {template.headerMediaKind === "image"
                ? " JPG or PNG, up to 5 MB."
                : template.headerMediaKind === "video"
                  ? " MP4 or 3GP, up to 16 MB."
                  : " PDF."}
            </p>
          </div>
        )}

        {template && placeholderCount > 0 && (
          <div className="flex flex-col gap-3">
            <div>
              <Label>What fills the blanks</Label>
              <p className="text-xs text-muted-foreground">
                Each blank is either the same words for everybody, or that person&rsquo;s own
                details. A variable that turns out to be blank for somebody uses the fallback
                instead — WhatsApp rejects a message with an empty blank in it.
              </p>
            </div>

            {paramSources.map((source, index) => {
              const variable =
                source.kind === "variable"
                  ? variables.find((entry) => entry.key === source.key)
                  : undefined;
              return (
                <div key={index} className="flex flex-wrap items-end gap-3 rounded-md border p-3">
                  <span className="pb-2 font-mono text-sm text-muted-foreground">
                    {`{{${index + 1}}}`}
                  </span>

                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Fill with</Label>
                    <Select
                      value={source.kind === "variable" ? source.key : FIXED_TEXT}
                      onValueChange={(value) => chooseVariable(index, value)}
                    >
                      <SelectTrigger className="h-9 w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FIXED_TEXT}>The same words for everybody</SelectItem>
                        {variables.map((entry) => (
                          <SelectItem key={entry.key} value={entry.key}>
                            {entry.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {source.kind === "text" ? (
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Words</Label>
                      <Input
                        className="h-9 w-64"
                        value={source.value}
                        placeholder="NIFT 2027 batch"
                        onChange={(event) =>
                          setSource(index, { kind: "text", value: event.target.value })
                        }
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">
                        If we don&rsquo;t have it, say
                      </Label>
                      <Input
                        className="h-9 w-40"
                        value={source.fallback}
                        placeholder="there"
                        onChange={(event) =>
                          setSource(index, {
                            kind: "variable",
                            key: source.key,
                            fallback: event.target.value,
                          })
                        }
                      />
                    </div>
                  )}

                  {variable?.note && (
                    <p className="w-full text-xs text-muted-foreground">{variable.note}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {template && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">
              {preview?.sampleValues
                ? `As ${preview.sample[0] ?? "the first person on the list"} will read it`
                : "Roughly how it will read"}
            </Label>
            {/* The last thing anybody sees before four hundred copies of
                it leave. Once the audience has been checked this is a
                real recipient's own values, not an example. */}
            <p className="whitespace-pre-wrap rounded-md border border-dashed p-3 text-sm">
              {filledBody}
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">When it goes out</h3>

        <div className="flex gap-1">
          {(["now", "schedule"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setSendMode(value);
                // Filled the first time it is needed rather than on every
                // render, so there is no chance of the server and the
                // browser disagreeing about what "tomorrow" is.
                if (value === "schedule" && !scheduledAt) {
                  setScheduledAt(defaultScheduleValue(new Date()));
                }
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                sendMode === value ? "bg-accent" : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {value === "now" ? "Straight away" : "At a set time"}
            </button>
          ))}
        </div>

        {sendMode === "schedule" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="broadcast-scheduled-at" className="text-xs text-muted-foreground">
              Date and time (India)
            </Label>
            <Input
              id="broadcast-scheduled-at"
              name="scheduledAt"
              type="datetime-local"
              className="h-9 w-64"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The audience is fixed now, not at that time — whoever matches the filters today is who
              gets it. Anybody who opts out in the meantime is dropped at send. You can stop it any
              time before it goes.
            </p>
            <p className="text-xs text-muted-foreground">{SWEEP_CADENCE_NOTE}</p>
          </div>
        )}
      </section>

      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending || !templateName} className="w-fit">
        {pending
          ? "Queuing…"
          : sendMode === "schedule"
            ? preview && !preview.error
              ? `Schedule for ${preview.count}`
              : "Schedule"
            : preview && !preview.error
              ? `Send to ${preview.count}`
              : "Send"}
      </Button>
    </form>
  );
}
