import type { FlowStep, SendTemplateConfig } from "./flow-engine";
import type { ParamSource } from "./personalise";

/**
 * What "send me a test" does with each step, decided without sending.
 *
 * Only the steps that put a message in front of the person are sent;
 * everything that waits, branches or changes a record is listed as skipped,
 * because a test must not touch a real lead or take a fortnight.
 */
export type TestItem =
  | { position: number; action: "send"; step: FlowStep }
  | { position: number; action: "skip"; reason: string };

const SENDERS = new Set(["send_template", "send_text", "send_buttons", "send_media", "ask_question"]);

export function planFlowTest(steps: FlowStep[]): TestItem[] {
  return [...steps]
    .sort((a, b) => a.position - b.position)
    .map((step): TestItem => {
      if (SENDERS.has(step.kind)) return { position: step.position, action: "send", step };
      const reason =
        step.kind === "wait" || step.kind === "wait_for_reply"
          ? "Waiting is skipped in a test."
          : step.kind === "condition"
            ? "Branches need a real lead."
            : "Changes a lead, so it does nothing in a test.";
      return { position: step.position, action: "skip", reason };
    });
}

const SAMPLE: Record<string, string> = {
  first_name: "Anjali",
  name: "Anjali Menon",
  student_name: "Anjali Menon",
  course: "NIFT Foundation",
  courses_interested: "NIFT Foundation",
  centre: "Kochi",
  center: "Kochi",
  counsellor: "Your counsellor",
};

/** Values for a template's `{{n}}` in a test: fixed text as written, merge variables as a sample so the shape is visible. */
export function sampleParams(config: Partial<SendTemplateConfig>): string[] {
  const sources: ParamSource[] = Array.isArray(config.params) ? config.params : [];
  return sources.map((source) =>
    source.kind === "text" ? source.value || "sample" : (SAMPLE[source.key] ?? source.fallback ?? "") || "sample",
  );
}
