/**
 * What an automation flow does next.
 *
 * A flow is a numbered list of steps a lead walks down: send this
 * template, wait two days, send that one, and — the part that makes it
 * more than a drip — wait for their reply and go somewhere different
 * depending on what they said. Leon asked for this in AiSensy's terms:
 * a message with buttons, and the button decides the conversation.
 *
 * ## Why a numbered list and not a tree
 *
 * A branching tree is the obvious model and the wrong one to hand a
 * non-technical user. It is hard to draw in a form, hard to read back,
 * and every edit risks orphaning a subtree. Steps are numbered instead,
 * and a `wait_for_reply` step's branches say which NUMBER to jump to.
 * That expresses everything a coaching institute's follow-up needs
 * ("interested → step 4, not now → step 7, no answer in two days →
 * step 9"), reads like a list, and cannot orphan anything.
 *
 * ## Why this file is pure
 *
 * Everything here decides; nothing sends. The consequences of getting it
 * wrong are a person's phone buzzing at 3am, or a loop that messages
 * somebody eleven times in a row, so the decisions are tested on their
 * own without a database or Meta in the way.
 */

import type { ParamSource } from "./personalise";

/** The things a step can be. Fixed in code: each is an action the engine knows how to carry out. */
export const FLOW_STEP_KINDS = [
  "send_template",
  "wait",
  "wait_for_reply",
  "add_tag",
  "set_stage",
  "notify_owner",
  "stop",
] as const;
export type FlowStepKind = (typeof FLOW_STEP_KINDS)[number];

/** What starts a run. Also fixed in code — each corresponds to a real emit site. */
export const FLOW_TRIGGERS = [
  "lead_created",
  "stage_entered",
  "tag_added",
  "inbound_keyword",
  "manual",
] as const;
export type FlowTrigger = (typeof FLOW_TRIGGERS)[number];

/**
 * Where a branch sends somebody.
 *
 * `next` continues down the list, `stop` ends the run, a number jumps to
 * that step. Jumping backwards is allowed — "not now" looping back to a
 * nurture message a month later is a real thing an institute wants — and
 * is why `MAX_STEPS_PER_ADVANCE` exists below.
 */
export type FlowGoto = number | "next" | "stop";

export interface FlowBranch {
  /** The button text or keyword to match, case- and space-insensitively. */
  match: string;
  goto: FlowGoto;
}

export interface WaitForReplyConfig {
  /** How long to wait before giving up on a reply. */
  hours: number;
  branches: FlowBranch[];
  /** Where somebody who never replies goes. Defaults to continuing. */
  onTimeout?: FlowGoto;
  /** Where a reply that matches no branch goes. Defaults to continuing. */
  onOther?: FlowGoto;
}

export interface SendTemplateConfig {
  templateName: string;
  templateLanguage: string;
  params: ParamSource[];
}

export interface FlowStep {
  id: string;
  position: number;
  kind: FlowStepKind;
  config: Record<string, unknown>;
}

/**
 * A run cannot execute more than this many steps in one pass.
 *
 * Branches may jump backwards, so a flow CAN be written as a loop — and
 * a loop of `add_tag` steps with no wait in it would otherwise spin
 * forever inside one cron run. Twenty is far more than any real
 * follow-up sequence and small enough that a mistake costs nothing.
 */
export const MAX_STEPS_PER_ADVANCE = 20;

export function stepAt(steps: FlowStep[], position: number): FlowStep | null {
  return steps.find((step) => step.position === position) ?? null;
}

export function firstStep(steps: FlowStep[]): FlowStep | null {
  return [...steps].sort((a, b) => a.position - b.position)[0] ?? null;
}

/** The next step down the list, or null at the end — which ends the run. */
export function nextStep(steps: FlowStep[], current: number): FlowStep | null {
  return (
    [...steps].sort((a, b) => a.position - b.position).find((step) => step.position > current) ??
    null
  );
}

/**
 * Turns a branch's destination into an actual step.
 *
 * Null means the run ends — either explicitly ("stop"), by running off
 * the end of the list, or because the flow points at a step somebody has
 * since deleted. That last case ends the run quietly rather than
 * throwing: a half-edited flow must not strand people mid-conversation
 * with an error nobody sees.
 */
export function resolveGoto(steps: FlowStep[], current: number, goto: FlowGoto): FlowStep | null {
  if (goto === "stop") return null;
  if (goto === "next") return nextStep(steps, current);
  return stepAt(steps, goto);
}

/** Loose matching, because a person types "yes " or "YES" and means yes. */
export function normaliseReply(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Which branch a reply takes.
 *
 * A quick-reply button arrives as its own exact text, so an exact match
 * is the common case and is tried first. Falling back to "contains"
 * catches somebody who typed "yes please" rather than pressing the
 * button, which on WhatsApp is most people.
 */
export function matchBranch(text: string | null, branches: FlowBranch[]): FlowBranch | null {
  const reply = normaliseReply(text ?? "");
  if (!reply) return null;

  const exact = branches.find((branch) => normaliseReply(branch.match) === reply);
  if (exact) return exact;

  return (
    branches.find((branch) => {
      const needle = normaliseReply(branch.match);
      return needle.length > 0 && reply.includes(needle);
    }) ?? null
  );
}

export function waitConfig(step: FlowStep): WaitForReplyConfig {
  const config = step.config as Partial<WaitForReplyConfig>;
  return {
    hours: typeof config.hours === "number" && config.hours > 0 ? config.hours : 24,
    branches: Array.isArray(config.branches)
      ? config.branches.filter(
          (branch): branch is FlowBranch =>
            Boolean(branch) && typeof branch.match === "string" && branch.match.trim().length > 0,
        )
      : [],
    onTimeout: config.onTimeout ?? "next",
    onOther: config.onOther ?? "next",
  };
}

/** How many milliseconds a `wait` or `wait_for_reply` step parks a run for. */
export function waitMs(step: FlowStep): number {
  const raw = (step.config as { hours?: unknown }).hours;
  const hours = typeof raw === "number" && raw > 0 ? raw : 24;
  return Math.round(hours * 60 * 60 * 1000);
}

export interface FlowValidationIssue {
  position: number | null;
  message: string;
}

/**
 * What is wrong with a flow, in words an admin can act on.
 *
 * Checked before a flow can be switched on rather than discovered at
 * 3am against a real person: an active flow that jumps to a step that
 * does not exist silently ends everybody's run, and a `wait_for_reply`
 * with no branches is a step that can only ever time out.
 */
export function validateFlow(steps: FlowStep[]): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  if (steps.length === 0) {
    return [{ position: null, message: "This flow has no steps yet." }];
  }
  if (!steps.some((step) => step.kind === "send_template")) {
    issues.push({ position: null, message: "This flow never sends anything." });
  }

  const positions = new Set(steps.map((step) => step.position));

  for (const step of steps) {
    if (step.kind === "send_template") {
      const config = step.config as Partial<SendTemplateConfig>;
      if (!config.templateName) {
        issues.push({ position: step.position, message: "Choose an approved template." });
      }
    }

    if (step.kind !== "wait_for_reply") continue;
    const config = waitConfig(step);
    if (config.branches.length === 0) {
      issues.push({
        position: step.position,
        message: "This step waits for a reply but has no answers to look for.",
      });
    }
    for (const goto of [
      ...config.branches.map((branch) => branch.goto),
      config.onTimeout,
      config.onOther,
    ]) {
      if (typeof goto === "number" && !positions.has(goto)) {
        issues.push({ position: step.position, message: `There is no step ${goto} to jump to.` });
      }
    }
  }

  return issues;
}

/** A one-line description of a step, for the flow list and the run history. */
export function describeStep(step: FlowStep): string {
  switch (step.kind) {
    case "send_template": {
      const config = step.config as Partial<SendTemplateConfig>;
      return `Send "${config.templateName ?? "(no template)"}"`;
    }
    case "wait":
      return `Wait ${describeHours(waitMs(step) / 3_600_000)}`;
    case "wait_for_reply": {
      const config = waitConfig(step);
      const answers = config.branches.map((branch) => branch.match).join(", ");
      return `Wait ${describeHours(config.hours)} for a reply${answers ? ` — ${answers}` : ""}`;
    }
    case "add_tag":
      return "Add a tag";
    case "set_stage":
      return "Move to a stage";
    case "notify_owner":
      return "Tell the counsellor";
    case "stop":
      return "Stop here";
  }
}

export function describeHours(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
