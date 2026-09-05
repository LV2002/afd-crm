"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

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
import { FLOW_STEP_KINDS, type FlowGoto, type FlowStepKind } from "@/lib/whatsapp/flow-engine";
import { mergeVariablesFor } from "@/lib/whatsapp/merge-variables";
import type { ParamSource } from "@/lib/whatsapp/personalise";

import { addStep, deleteStep, updateStep, type FlowFormState } from "../actions";

const initialState: FlowFormState = {};
const FIXED_TEXT = "__text__";

export const STEP_LABELS: Record<FlowStepKind, string> = {
  send_template: "Send a WhatsApp message",
  wait: "Wait",
  wait_for_reply: "Wait for their reply",
  add_tag: "Put a tag on them",
  set_stage: "Move them to a stage",
  notify_owner: "Tell their counsellor",
  stop: "Stop here",
};

export interface StepTemplate {
  name: string;
  language: string;
  body: string;
  placeholders: number;
}

export interface StepEditorLists {
  templates: StepTemplate[];
  tags: Array<{ id: string; name: string }>;
  stages: Array<{ id: string; name: string }>;
  /** Every step number in this flow, so a branch can only point somewhere real. */
  positions: number[];
}

interface Branch {
  match: string;
  goto: FlowGoto;
}

function gotoValue(goto: FlowGoto | undefined): string {
  if (goto === undefined) return "next";
  return typeof goto === "number" ? String(goto) : goto;
}

function parseGoto(value: string): FlowGoto {
  if (value === "next" || value === "stop") return value;
  return Number(value);
}

/** Where a branch can send somebody: on down the list, out of the flow, or to a numbered step. */
function GotoSelect({
  value,
  positions,
  onChange,
}: {
  value: FlowGoto | undefined;
  positions: number[];
  onChange: (next: FlowGoto) => void;
}) {
  return (
    <Select value={gotoValue(value)} onValueChange={(v) => onChange(parseGoto(v))}>
      <SelectTrigger className="h-9 w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="next">Carry on</SelectItem>
        <SelectItem value="stop">Stop</SelectItem>
        {positions.map((position) => (
          <SelectItem key={position} value={String(position)}>
            Go to step {position}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The settings for one step, whatever kind it is.
 *
 * The whole config travels as a single JSON field because its shape
 * depends entirely on the kind — a `wait` has hours, a `send_template`
 * has a template and its values, and inventing a form field per possible
 * key would mean a form mostly full of things that do not apply.
 */
function StepConfig({
  kind,
  config,
  setConfig,
  lists,
}: {
  kind: FlowStepKind;
  config: Record<string, unknown>;
  setConfig: (next: Record<string, unknown>) => void;
  lists: StepEditorLists;
}) {
  const variables = mergeVariablesFor("lead");

  if (kind === "stop") {
    return <p className="text-xs text-muted-foreground">Nothing to set — the run ends here.</p>;
  }

  if (kind === "wait") {
    return (
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Hours to wait</Label>
        <Input
          type="number"
          min={1}
          className="h-9 w-28"
          value={Number(config.hours ?? 24)}
          onChange={(event) => setConfig({ ...config, hours: Number(event.target.value) })}
        />
        <p className="text-xs text-muted-foreground">24 is a day, 48 is two, 168 is a week.</p>
      </div>
    );
  }

  if (kind === "add_tag" || kind === "set_stage") {
    const options = kind === "add_tag" ? lists.tags : lists.stages;
    const key = kind === "add_tag" ? "tagId" : "stageId";
    return (
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">
          {kind === "add_tag" ? "Tag" : "Stage"}
        </Label>
        <Select
          value={String(config[key] ?? "")}
          onValueChange={(value) => setConfig({ ...config, [key]: value })}
        >
          <SelectTrigger className="h-9 w-64">
            <SelectValue placeholder="Pick one" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (kind === "notify_owner") {
    return (
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">What to tell them</Label>
        <Input
          className="h-9 w-full"
          value={String(config.message ?? "")}
          placeholder="Said they're interested — call them today"
          onChange={(event) => setConfig({ ...config, message: event.target.value })}
        />
      </div>
    );
  }

  if (kind === "send_template") {
    const templateName = String(config.templateName ?? "");
    const template = lists.templates.find((entry) => entry.name === templateName);
    const placeholders = template?.placeholders ?? 0;
    const params: ParamSource[] = Array.isArray(config.params)
      ? (config.params as ParamSource[])
      : [];
    const sources: ParamSource[] = Array.from(
      { length: placeholders },
      (_, index) => params[index] ?? { kind: "text", value: "" },
    );

    function setSource(index: number, next: ParamSource) {
      const copy = [...sources];
      copy[index] = next;
      setConfig({ ...config, params: copy });
    }

    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Approved template</Label>
          <Select
            value={templateName}
            onValueChange={(value) => {
              const chosen = lists.templates.find((entry) => entry.name === value);
              // Values are cleared with the template: placeholder 2 of the
              // old one is rarely placeholder 2 of the new one, and
              // carrying them over sends the course where the name goes.
              setConfig({
                ...config,
                templateName: value,
                templateLanguage: chosen?.language ?? "en_US",
                params: [],
              });
            }}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent>
              {lists.templates.map((entry) => (
                <SelectItem key={`${entry.name}-${entry.language}`} value={entry.name}>
                  {entry.name} ({entry.language})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {template && (
          <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{template.body}</p>
        )}

        {sources.map((source, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <span className="pb-2 font-mono text-xs text-muted-foreground">{`{{${index + 1}}}`}</span>
            <Select
              value={source.kind === "variable" ? source.key : FIXED_TEXT}
              onValueChange={(value) =>
                setSource(
                  index,
                  value === FIXED_TEXT
                    ? { kind: "text", value: "" }
                    : {
                        kind: "variable",
                        key: value,
                        fallback: value === "first_name" ? "there" : "",
                      },
                )
              }
            >
              <SelectTrigger className="h-9 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FIXED_TEXT}>The same words for everybody</SelectItem>
                {variables.map((variable) => (
                  <SelectItem key={variable.key} value={variable.key}>
                    {variable.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {source.kind === "text" ? (
              <Input
                className="h-9 w-56"
                placeholder="Words"
                value={source.value}
                onChange={(event) => setSource(index, { kind: "text", value: event.target.value })}
              />
            ) : (
              <Input
                className="h-9 w-40"
                placeholder="If unknown, say…"
                value={source.fallback}
                onChange={(event) =>
                  setSource(index, {
                    kind: "variable",
                    key: source.key,
                    fallback: event.target.value,
                  })
                }
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  // wait_for_reply
  const branches: Branch[] = Array.isArray(config.branches) ? (config.branches as Branch[]) : [];

  function setBranch(index: number, next: Branch) {
    const copy = [...branches];
    copy[index] = next;
    setConfig({ ...config, branches: copy });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Hours to wait for a reply</Label>
        <Input
          type="number"
          min={1}
          className="h-9 w-28"
          value={Number(config.hours ?? 48)}
          onChange={(event) => setConfig({ ...config, hours: Number(event.target.value) })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Answers to look for</Label>
        <p className="text-xs text-muted-foreground">
          Type the button&rsquo;s exact words. A typed reply counts too if it contains them, which
          is what most people send.
        </p>
        {branches.map((branch, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Input
              className="h-9 w-44"
              placeholder="Yes, interested"
              value={branch.match}
              onChange={(event) => setBranch(index, { ...branch, match: event.target.value })}
            />
            <GotoSelect
              value={branch.goto}
              positions={lists.positions}
              onChange={(goto) => setBranch(index, { ...branch, goto })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setConfig({ ...config, branches: branches.filter((_, i) => i !== index) })
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() =>
            setConfig({ ...config, branches: [...branches, { match: "", goto: "next" }] })
          }
        >
          <Plus className="size-4" /> Add an answer
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">If they never reply</Label>
          <GotoSelect
            value={config.onTimeout as FlowGoto | undefined}
            positions={lists.positions}
            onChange={(goto) => setConfig({ ...config, onTimeout: goto })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">If they say something else</Label>
          <GotoSelect
            value={config.onOther as FlowGoto | undefined}
            positions={lists.positions}
            onChange={(goto) => setConfig({ ...config, onOther: goto })}
          />
        </div>
      </div>
    </div>
  );
}

export function ExistingStep({
  flowId,
  stepId,
  position,
  kind,
  initialConfig,
  lists,
}: {
  flowId: string;
  stepId: string;
  position: number;
  kind: FlowStepKind;
  initialConfig: Record<string, unknown>;
  lists: StepEditorLists;
}) {
  const [state, action, pending] = useActionState(updateStep, initialState);
  const [removeState, removeAction] = useActionState(deleteStep, initialState);
  const [config, setConfig] = useState(initialConfig);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">
          <span className="mr-2 rounded bg-muted px-2 py-0.5 font-mono text-xs">{position}</span>
          {STEP_LABELS[kind]}
        </h4>
        <form action={removeAction}>
          <input type="hidden" name="flowId" value={flowId} />
          <input type="hidden" name="stepId" value={stepId} />
          <Button type="submit" variant="ghost" size="sm">
            <Trash2 className="size-4" />
          </Button>
        </form>
      </div>

      <StepConfig kind={kind} config={config} setConfig={setConfig} lists={lists} />

      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="flowId" value={flowId} />
        <input type="hidden" name="stepId" value={stepId} />
        <input type="hidden" name="config" value={JSON.stringify(config)} />
        <Button type="submit" size="sm" disabled={pending} className="w-fit">
          <Save className="size-4" />
          {pending ? "Saving…" : "Save step"}
        </Button>
        <FormMessage
          error={state.error ?? removeState.error}
          success={state.success ?? removeState.success}
        />
      </form>
    </div>
  );
}

export function AddStep({ flowId, lists }: { flowId: string; lists: StepEditorLists }) {
  const [state, action, pending] = useActionState(addStep, initialState);
  const [kind, setKind] = useState<FlowStepKind>("send_template");
  const [config, setConfig] = useState<Record<string, unknown>>({});

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <input type="hidden" name="flowId" value={flowId} />
      <input type="hidden" name="config" value={JSON.stringify(config)} />

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Add a step</Label>
        <Select
          name="kind"
          value={kind}
          onValueChange={(value) => {
            setKind(value as FlowStepKind);
            // A wait's hours mean nothing on a tag step, so the settings
            // start again rather than carrying a key the new kind ignores.
            setConfig({});
          }}
        >
          <SelectTrigger className="h-9 w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FLOW_STEP_KINDS.map((value) => (
              <SelectItem key={value} value={value}>
                {STEP_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <StepConfig kind={kind} config={config} setConfig={setConfig} lists={lists} />

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        <Plus className="size-4" />
        {pending ? "Adding…" : "Add to the end"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Steps are always added at the end and keep their numbers forever — a branch points at a
        number, so renumbering would quietly send people somewhere else.
      </p>
    </form>
  );
}
