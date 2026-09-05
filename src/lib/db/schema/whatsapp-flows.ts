import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { FlowStepKind, FlowTrigger } from "@/lib/whatsapp/flow-engine";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { leads } from "./leads";
import { centers } from "./org";

/**
 * Automation flows — the thing Leon described as what AiSensy does.
 *
 * A flow is a numbered list of steps a lead walks down: send a template,
 * wait, send another, and — the part that makes it a conversation rather
 * than a drip — wait for their reply and go somewhere different
 * depending on which button they pressed.
 *
 * Everything a flow sends is a TEMPLATE. A run reaches somebody days
 * after they last wrote to us, which is outside the 24-hour customer
 * service window, and a template is the only thing Meta accepts out
 * there. Same constraint as broadcasts, for the same reason.
 *
 * `trigger_type` and every step `kind` are values from
 * `lib/whatsapp/flow-engine.ts`, kept in code rather than as rows: each
 * one is an action the engine has to know how to carry out, so it cannot
 * be invented at runtime. Everything else about a flow — its wording,
 * timing, audience, which template, which branches — is data an admin
 * edits without a deploy.
 */
export const whatsappFlows = pgTable(
  "whatsapp_flows",
  {
    id: idColumn(),
    name: text("name").notNull(),
    description: text("description"),
    triggerType: text("trigger_type").$type<FlowTrigger>().notNull(),
    /** `{ stageId }`, `{ tagId }`, `{ keywords: [...] }` — shape depends on the trigger. */
    triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>(),
    /**
     * Off by default, and deliberately so. A flow is written over several
     * edits and a half-written one that starts messaging people the
     * moment its first step is saved is the worst possible default.
     * `validateFlow()` has to pass before this can be set.
     */
    isActive: boolean("is_active").notNull().default(false),
    /** Null means every centre. Set to keep a Kannur sequence off Kochi's leads. */
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index("whatsapp_flows_trigger_idx").on(t.triggerType)],
);

/**
 * One step. `position` is what branches jump to, so it is the step's
 * public name and is shown on screen — renumbering an existing flow
 * would silently redirect every branch pointing at it, which is why the
 * UI appends and never reflows.
 */
export const whatsappFlowSteps = pgTable(
  "whatsapp_flow_steps",
  {
    id: idColumn(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => whatsappFlows.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind").$type<FlowStepKind>().notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("whatsapp_flow_steps_flow_position_uq").on(t.flowId, t.position),
    check("whatsapp_flow_steps_position_positive", sql`position >= 1`),
  ],
);

/**
 * One lead's journey through one flow.
 *
 * `wake_at` is when the sweep should look at this run again — the whole
 * scheduling mechanism, and the reason a run costs nothing while it
 * waits. `awaiting_step_id` is set only while parked on a
 * `wait_for_reply`, and is what the inbound webhook looks for when a
 * message arrives.
 *
 * A partial unique index allows only ONE live run per lead per flow.
 * Without it a lead who re-enters a stage twice in a week gets two
 * concurrent copies of the same sequence, which reads to them as the
 * institute having lost track of who they are.
 */
export const whatsappFlowRuns = pgTable(
  "whatsapp_flow_runs",
  {
    id: idColumn(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => whatsappFlows.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    /** running | waiting | completed | stopped | failed */
    status: text("status").notNull().default("running"),
    currentStepId: uuid("current_step_id").references(() => whatsappFlowSteps.id, {
      onDelete: "set null",
    }),
    awaitingStepId: uuid("awaiting_step_id").references(() => whatsappFlowSteps.id, {
      onDelete: "set null",
    }),
    wakeAt: timestamp("wake_at", { withTimezone: true }),
    /** Why it ended — "replied: Not now", "opted out", "no phone number". Read by a person. */
    stopReason: text("stop_reason"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("whatsapp_flow_runs_live_uq")
      .on(t.flowId, t.leadId)
      .where(sql`status in ('running','waiting')`),
    index("whatsapp_flow_runs_wake_idx").on(t.wakeAt).where(sql`status in ('running','waiting')`),
    index("whatsapp_flow_runs_awaiting_idx").on(t.leadId).where(sql`awaiting_step_id is not null`),
  ],
);

/**
 * What actually happened, step by step.
 *
 * An automation nobody can audit is an automation nobody trusts —
 * "why did this student get that message?" has to have an answer, and
 * the flow definition alone cannot give it once the flow has been
 * edited since.
 */
export const whatsappFlowRunEvents = pgTable(
  "whatsapp_flow_run_events",
  {
    id: idColumn(),
    runId: uuid("run_id")
      .notNull()
      .references(() => whatsappFlowRuns.id, { onDelete: "cascade" }),
    stepId: uuid("step_id").references(() => whatsappFlowSteps.id, { onDelete: "set null" }),
    /** sent | waited | replied | timed_out | tagged | staged | notified | stopped | failed */
    kind: text("kind").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("whatsapp_flow_run_events_run_idx").on(t.runId, t.createdAt)],
);
