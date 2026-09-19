"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PacingResult } from "@/lib/curriculum/pacing";

import {
  archiveSyllabusRow,
  saveCurriculum,
  saveCurriculumItem,
  type SyllabusFormState,
} from "./actions";

type ItemKind = "teaching" | "practice" | "mock_test" | "revision";

interface PlanRow {
  id: string;
  course: string;
  academicYear: string | null;
  teachingEndDate: string | null;
  notes: string | null;
}

interface ItemRow {
  id: string;
  moduleId: string;
  topicId: string | null;
  kind: ItemKind;
  hours: string;
  coverage: string | null;
  sortOrder: number;
}

interface ModuleRow {
  id: string;
  name: string;
}
interface TopicRow {
  id: string;
  moduleId: string;
  name: string;
}
interface Option {
  value: string;
  label: string;
}

const EMPTY: SyllabusFormState = {};

const KIND_LABELS: Record<ItemKind, string> = {
  teaching: "Teaching",
  practice: "Practice",
  mock_test: "Mock test",
  revision: "Revision",
};

export function CoursePlan({
  plans,
  activePlan,
  items,
  modules,
  topics,
  courseOptions,
  pacing,
  canEdit,
}: {
  plans: PlanRow[];
  activePlan: PlanRow | null;
  items: ItemRow[];
  modules: ModuleRow[];
  topics: TopicRow[];
  courseOptions: Option[];
  pacing: PacingResult | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [addingPlan, setAddingPlan] = useState(false);
  const [addingBlock, setAddingBlock] = useState(false);

  const moduleName = useMemo(
    () => new Map(modules.map((m) => [m.id, m.name])),
    [modules],
  );
  const topicName = useMemo(() => new Map(topics.map((t) => [t.id, t.name])), [topics]);

  // Grouped by module, because that is the level at which a plan is wrong
  // first: "Drawing is 22 hours" is a judgement someone can make, and
  // "this topic is 1.5 hours" mostly is not.
  const grouped = useMemo(() => {
    const byModule = new Map<string, ItemRow[]>();
    for (const item of items) {
      const list = byModule.get(item.moduleId);
      if (list) list.push(item);
      else byModule.set(item.moduleId, [item]);
    }
    return Array.from(byModule.entries()).map(([moduleId, rows]) => ({
      moduleId,
      rows,
      hours: rows.reduce((sum, row) => sum + Number(row.hours), 0),
    }));
  }, [items]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Course plan</CardTitle>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant={addingPlan ? "ghost" : "outline"}
              onClick={() => setAddingPlan((v) => !v)}
            >
              {addingPlan ? <X className="size-4" /> : <Plus className="size-4" />}
              {addingPlan ? "Cancel" : "New plan"}
            </Button>
          ) : null}
        </div>

        {plans.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {plans.map((plan) => (
              <Button
                key={plan.id}
                type="button"
                size="sm"
                variant={plan.id === activePlan?.id ? "default" : "outline"}
                onClick={() => router.push(`/academics/syllabus?plan=${plan.id}`)}
              >
                {plan.course}
                {plan.academicYear ? ` ${plan.academicYear}` : ""}
              </Button>
            ))}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {addingPlan ? (
          <PlanForm courseOptions={courseOptions} onDone={() => setAddingPlan(false)} />
        ) : null}

        {!activePlan ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No course plan yet. Create one, pick the topics it covers, and give each one its
            hours.
          </p>
        ) : (
          <>
            {pacing ? <PacingPanel pacing={pacing} endDate={activePlan.teachingEndDate} /> : null}

            {grouped.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nothing planned yet for {activePlan.course}.
              </p>
            ) : null}

            {grouped.map((group) => (
              <div key={group.moduleId} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 border-b pb-1">
                  <h3 className="font-medium">
                    {moduleName.get(group.moduleId) ?? "Unknown module"}
                  </h3>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {group.hours} h
                  </span>
                </div>

                {group.rows.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm">
                          {item.topicId
                            ? (topicName.get(item.topicId) ?? "Unknown topic")
                            : KIND_LABELS[item.kind]}
                        </span>
                        {item.topicId && item.kind !== "teaching" ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {KIND_LABELS[item.kind]}
                          </span>
                        ) : null}
                      </div>
                      {item.coverage ? (
                        <p className="pt-0.5 text-sm text-muted-foreground">{item.coverage}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">{Number(item.hours)} h</span>
                    {canEdit ? (
                      <RemoveItemButton
                        id={item.id}
                        label={
                          item.topicId
                            ? (topicName.get(item.topicId) ?? "this block")
                            : KIND_LABELS[item.kind]
                        }
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            ))}

            {canEdit ? (
              addingBlock ? (
                <BlockForm
                  curriculumId={activePlan.id}
                  modules={modules}
                  topics={topics}
                  nextSortOrder={(items.at(-1)?.sortOrder ?? 0) + 10}
                  onDone={() => setAddingBlock(false)}
                />
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="self-start"
                  onClick={() => setAddingBlock(true)}
                >
                  <Plus className="size-4" />
                  Add a block
                </Button>
              )
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The answer to "does this still fit before mid-November".
 *
 * Deliberately blunt about the two failure modes: no timings entered at
 * all (which reads as "0 hours available" and would otherwise look like a
 * bug), and a plan that overruns, where the useful number is hours per
 * week rather than the total shortfall.
 */
function PacingPanel({ pacing, endDate }: { pacing: PacingResult; endDate: string | null }) {
  const tone = pacing.fits
    ? "border-emerald-600/30 bg-emerald-500/10"
    : "border-amber-600/30 bg-amber-500/10";

  return (
    <div className={`flex flex-col gap-2 rounded-md border p-3 ${tone}`}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <span>
          <strong className="tabular-nums">{pacing.hoursRequired} h</strong> planned
        </span>
        <span>
          <strong className="tabular-nums">{pacing.hoursAvailable} h</strong> available
          {endDate ? ` before ${endDate}` : ""}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {pacing.sessionsAvailable} sessions · {pacing.hoursPerWeek} h/week
        </span>
      </div>

      {pacing.sessionsAvailable === 0 ? (
        <p className="text-sm">
          This course has no class timings entered yet, so there is nothing to measure the plan
          against. Add the days and hours on the batch, and this will fill in.
        </p>
      ) : pacing.fits ? (
        <p className="text-sm">
          Fits, with {pacing.slackHours} hours to spare — about{" "}
          {Math.round((pacing.slackHours / Math.max(pacing.hoursPerWeek, 1)) * 10) / 10} weeks of
          slack for the days that get lost.
        </p>
      ) : (
        <p className="text-sm">
          {-pacing.slackHours} hours too many. Either add{" "}
          <strong>{pacing.extraHoursPerWeekNeeded} hours a week</strong>, move the finish date,
          or cut hours — practice is {pacing.byKind.practice} h and revision is{" "}
          {pacing.byKind.revision} h of the total.
        </p>
      )}
    </div>
  );
}

function PlanForm({
  courseOptions,
  onDone,
}: {
  courseOptions: Option[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveCurriculum, EMPTY);
  if (state.success) queueMicrotask(onDone);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-course">Course</Label>
          <select
            id="plan-course"
            name="course"
            required
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Choose…</option>
            {courseOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-year">Academic year</Label>
          <Input id="plan-year" name="academicYear" placeholder="2026-27" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-end">Finish teaching by</Label>
          <Input id="plan-end" name="teachingEndDate" type="date" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-notes">Notes (optional)</Label>
        <Textarea id="plan-notes" name="notes" rows={2} />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Create plan"}
        </Button>
      </div>
    </form>
  );
}

function BlockForm({
  curriculumId,
  modules,
  topics,
  nextSortOrder,
  onDone,
}: {
  curriculumId: string;
  modules: ModuleRow[];
  topics: TopicRow[];
  nextSortOrder: number;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveCurriculumItem, EMPTY);
  const [moduleId, setModuleId] = useState(modules[0]?.id ?? "");
  if (state.success) queueMicrotask(onDone);

  const moduleTopics = topics.filter((topic) => topic.moduleId === moduleId);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
      <input type="hidden" name="curriculumId" value={curriculumId} />
      <input type="hidden" name="sortOrder" value={nextSortOrder} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="block-module">Module</Label>
          <select
            id="block-module"
            name="moduleId"
            required
            value={moduleId}
            onChange={(event) => setModuleId(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {modules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="block-topic">Topic</Label>
          <select
            id="block-topic"
            name="topicId"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Whole module</option>
            {moduleTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="block-kind">Kind</Label>
          <select
            id="block-kind"
            name="kind"
            defaultValue="teaching"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {(Object.keys(KIND_LABELS) as ItemKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="block-hours">Hours</Label>
          <Input
            id="block-hours"
            name="hours"
            type="number"
            step="0.25"
            min="0"
            defaultValue="1"
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="block-coverage">What is covered, for this course</Label>
        <Textarea
          id="block-coverage"
          name="coverage"
          rows={3}
          placeholder="One-point and two-point perspective only. No three-point — that is Foundation."
        />
        <p className="text-xs text-muted-foreground">
          This is the part that differs between courses, and the part a faculty member reads
          before the class.
        </p>
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Add block"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RemoveItemButton({ id, label }: { id: string; label: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={busy}
      aria-label={`Remove ${label}`}
      onClick={async () => {
        if (!window.confirm(`Remove "${label}" from this plan?`)) return;
        setBusy(true);
        await archiveSyllabusRow("item", id);
        setBusy(false);
      }}
    >
      <X className="size-3.5" />
    </Button>
  );
}
