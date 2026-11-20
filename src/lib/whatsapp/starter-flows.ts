import type { FlowStepKind, FlowTrigger } from "./flow-engine";

/**
 * Ready-made automations a person can start from instead of a blank page.
 * They are copied into ordinary rows (switched OFF) and then edited like
 * any other, so nothing here is special at run time.
 *
 * All start on a keyword: the person has just written to us, so the
 * 24-hour window is open and free-form messages are allowed.
 */
export interface StarterFlow {
  key: string;
  name: string;
  description: string;
  triggerType: FlowTrigger;
  triggerConfig: Record<string, unknown>;
  steps: Array<{ kind: FlowStepKind; config: Record<string, unknown> }>;
}

export const STARTER_FLOWS: StarterFlow[] = [
  {
    key: "welcome-collect",
    name: "Welcome and collect details",
    description: "When somebody says hi, greet them, ask their city and exam year, and tell their counsellor.",
    triggerType: "inbound_keyword",
    triggerConfig: { keywords: ["hi", "hello", "hey", "info"] },
    steps: [
      { kind: "send_text", config: { text: "Hi! Welcome to AFD India. I have two quick questions so the right counsellor can help you." } },
      { kind: "ask_question", config: { question: "Which city are you in?", field: "city", hours: 24 } },
      { kind: "ask_question", config: { question: "Which year will you write your entrance exam? (for example 2027)", field: "exam_year", hours: 24 } },
      { kind: "send_text", config: { text: "Thank you! A counsellor will message you shortly." } },
      { kind: "notify_owner", config: { message: "Answered the welcome questions — say hello." } },
    ],
  },
  {
    key: "course-finder",
    name: "Course finder",
    description: "Offers three buttons for the exam they are preparing for, replies with the right information and tells their counsellor.",
    triggerType: "inbound_keyword",
    triggerConfig: { keywords: ["courses", "course", "batch"] },
    steps: [
      { kind: "send_buttons", config: { text: "Which exam are you preparing for?", buttons: ["NID / NIFT", "UCEED / CEED", "NATA / JEE"] } },
      {
        kind: "wait_for_reply",
        config: {
          hours: 24,
          branches: [
            { match: "NID / NIFT", goto: 3 },
            { match: "UCEED / CEED", goto: 6 },
            { match: "NATA / JEE", goto: 9 },
          ],
          onOther: "stop",
          onTimeout: "stop",
        },
      },
      { kind: "send_text", config: { text: "Great! Our NID and NIFT batches cover the studio test and the situation test. A counsellor will share dates and fees." } },
      { kind: "notify_owner", config: { message: "Interested in NID / NIFT." } },
      { kind: "stop", config: {} },
      { kind: "send_text", config: { text: "Great! Our UCEED and CEED batches cover design aptitude and the drawing paper. A counsellor will share dates and fees." } },
      { kind: "notify_owner", config: { message: "Interested in UCEED / CEED." } },
      { kind: "stop", config: {} },
      { kind: "send_text", config: { text: "Great! Our NATA and JEE Paper 2 batches cover drawing, aptitude and maths. A counsellor will share dates and fees." } },
      { kind: "notify_owner", config: { message: "Interested in NATA / JEE Paper 2." } },
    ],
  },
];
