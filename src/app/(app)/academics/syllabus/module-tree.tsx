"use client";

import { useActionState, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { archiveSyllabusRow, saveModule, saveTopic, type SyllabusFormState } from "./actions";

interface ModuleRow {
  id: string;
  name: string;
  subject: string | null;
  description: string | null;
  sortOrder: number;
}

interface TopicRow {
  id: string;
  moduleId: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

interface Option {
  value: string;
  label: string;
}

const EMPTY: SyllabusFormState = {};

/**
 * The master syllabus: modules, and the topics inside them.
 *
 * Collapsible, and collapsed by default past the first module. AFD's
 * syllabus runs to several hundred topics; a flat expanded list is a
 * scroll, not a structure, and the coordinator's complaint about her
 * spreadsheet is precisely that she cannot see the shape of it.
 *
 * Everything saves through a Server Action rather than an onChange
 * handler. A half-typed topic name must not reach the database, and a
 * form that saves on blur teaches people to distrust it.
 */
export function ModuleTree({
  modules,
  topics,
  subjectOptions,
  canEdit,
}: {
  modules: ModuleRow[];
  topics: TopicRow[];
  subjectOptions: Option[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(modules.slice(0, 1).map((m) => m.id)),
  );
  const [addingModule, setAddingModule] = useState(false);

  const topicsByModule = new Map<string, TopicRow[]>();
  for (const topic of topics) {
    const list = topicsByModule.get(topic.moduleId);
    if (list) list.push(topic);
    else topicsByModule.set(topic.moduleId, [topic]);
  }

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Modules and topics</CardTitle>
          <p className="text-sm text-muted-foreground">
            Shared by every course. {modules.length} modules, {topics.length} topics.
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant={addingModule ? "ghost" : "outline"}
            onClick={() => setAddingModule((v) => !v)}
          >
            {addingModule ? <X className="size-4" /> : <Plus className="size-4" />}
            {addingModule ? "Cancel" : "Module"}
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {addingModule ? (
          <ModuleForm
            subjectOptions={subjectOptions}
            nextSortOrder={(modules.at(-1)?.sortOrder ?? 0) + 10}
            onDone={() => setAddingModule(false)}
          />
        ) : null}

        {modules.length === 0 && !addingModule ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No modules yet. Start with the big headings — &ldquo;Drawing
            Fundamentals&rdquo;, &ldquo;Design Aptitude&rdquo; — then add topics inside them.
          </p>
        ) : null}

        {modules.map((module) => {
          const moduleTopics = topicsByModule.get(module.id) ?? [];
          const isOpen = open.has(module.id);
          return (
            <div key={module.id} className="rounded-md border">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggle(module.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate font-medium">{module.name}</span>
                  {module.subject ? (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {module.subject}
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                    {moduleTopics.length}
                  </span>
                </button>
              </div>

              {isOpen ? (
                <div className="border-t bg-muted/30 px-3 py-2">
                  {module.description ? (
                    <p className="pb-2 text-sm text-muted-foreground">{module.description}</p>
                  ) : null}

                  <ul className="flex flex-col">
                    {moduleTopics.map((topic) => (
                      <li
                        key={topic.id}
                        className="flex items-baseline gap-2 border-b border-border/50 py-1.5 last:border-0"
                      >
                        <span className="min-w-0 flex-1 text-sm">{topic.name}</span>
                        {canEdit ? (
                          <RemoveButton kind="topic" id={topic.id} label={topic.name} />
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {moduleTopics.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">No topics yet.</p>
                  ) : null}

                  {canEdit ? (
                    <TopicForm
                      moduleId={module.id}
                      nextSortOrder={(moduleTopics.at(-1)?.sortOrder ?? 0) + 10}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ModuleForm({
  subjectOptions,
  nextSortOrder,
  onDone,
}: {
  subjectOptions: Option[];
  nextSortOrder: number;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveModule, EMPTY);

  if (state.success) {
    // The list behind this form has already been revalidated, so the form
    // has done its job; closing it is the only thing left.
    queueMicrotask(onDone);
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
      <input type="hidden" name="sortOrder" value={nextSortOrder} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="module-name">Module name</Label>
          <Input id="module-name" name="name" required placeholder="Drawing Fundamentals" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="module-subject">Subject</Label>
          <Input
            id="module-subject"
            name="subject"
            list="syllabus-subjects"
            placeholder="Drawing"
          />
          <datalist id="syllabus-subjects">
            {subjectOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </datalist>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="module-description">Notes (optional)</Label>
        <Textarea id="module-description" name="description" rows={2} />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Add module"}
        </Button>
      </div>
    </form>
  );
}

function TopicForm({ moduleId, nextSortOrder }: { moduleId: string; nextSortOrder: number }) {
  const [state, action, pending] = useActionState(saveTopic, EMPTY);

  return (
    <form action={action} className="flex items-start gap-2 pt-2">
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="sortOrder" value={nextSortOrder} />
      <div className="flex-1">
        <Input
          name="name"
          required
          placeholder="Add a topic…"
          aria-label="New topic name"
          className="h-8"
        />
        {state.error ? <p className="pt-1 text-sm text-destructive">{state.error}</p> : null}
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : "Add"}
      </Button>
    </form>
  );
}

/**
 * Removing is a soft delete, so the confirm says "remove" rather than
 * "delete permanently" — the word has to match what actually happens or
 * people learn to ignore it.
 */
function RemoveButton({
  kind,
  id,
  label,
}: {
  kind: "module" | "topic" | "item";
  id: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={busy}
      aria-label={`Remove ${label}`}
      onClick={async () => {
        if (!window.confirm(`Remove "${label}"? It stays on past classes that used it.`)) return;
        setBusy(true);
        await archiveSyllabusRow(kind, id);
        setBusy(false);
      }}
    >
      <X className="size-3.5" />
    </Button>
  );
}
