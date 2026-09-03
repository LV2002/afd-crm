import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { centers } from "./org";
import { pipelineStages } from "./reference";

/**
 * The sales object. Identity is the *person*, not the enquiry — many
 * `enquiries` rows can point at one `leads` row. Stops changing after the
 * sales->accounts gate (Phase 4); `students` is the academics object,
 * created at the second gate, and never queries this table.
 */
export const leads = pgTable(
  "leads",
  {
    id: idColumn(),
    /** Human-friendly reference number, distinct from the uuid PK. */
    leadNumber: bigserial("lead_number", { mode: "number" }).notNull(),

    studentName: text("student_name").notNull(),
    fatherName: text("father_name"),
    motherName: text("mother_name"),

    primaryPhone: text("primary_phone").notNull(),
    alternatePhone: text("alternate_phone"),
    parentPhone: text("parent_phone"),
    email: text("email"),

    dob: date("dob"),
    gender: text("gender"),

    addressLine: text("address_line"),
    city: text("city"),
    district: text("district"),
    state: text("state"),
    stateOther: text("state_other"),
    pincode: text("pincode"),
    country: text("country").notNull().default("India"),

    educationStatus: text("education_status"),
    schoolCollege: text("school_college"),
    board: text("board"),
    parentsOccupation: text("parents_occupation"),
    previousAttempts: integer("previous_attempts"),

    interestedExams: text("interested_exams").array(),
    examYear: text("exam_year"),
    coursesInterested: text("courses_interested").array(),
    preferredMode: text("preferred_mode"),

    firstTouchSource: text("first_touch_source"),
    firstTouchSubSource: text("first_touch_sub_source"),
    firstTouchCampaign: text("first_touch_campaign"),
    lastTouchSource: text("last_touch_source"),
    lastTouchSubSource: text("last_touch_sub_source"),
    lastTouchCampaign: text("last_touch_campaign"),
    gclid: text("gclid"),
    fbclid: text("fbclid"),
    utm: jsonb("utm").$type<Record<string, unknown>>(),

    centerId: uuid("center_id").references(() => centers.id, { onDelete: "restrict" }),
    assignedTo: uuid("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
    stageId: uuid("stage_id").references(() => pipelineStages.id, { onDelete: "restrict" }),

    /** FK to dropdown_options(category='temperature') by value — no hard FK, see dropdown_options. */
    temperature: text("temperature"),
    temperatureOverrideUntil: timestamp("temperature_override_until", { withTimezone: true }),
    /** Literal 'rule', or a profiles.id as text when a human set it. */
    temperatureSetBy: text("temperature_set_by"),

    score: integer("score"),
    isCompetitorStudent: boolean("is_competitor_student").notNull().default(false),
    competitorInstitute: text("competitor_institute"),

    referredByLeadId: uuid("referred_by_lead_id").references((): AnyPgColumn => leads.id, {
      onDelete: "set null",
    }),

    brochureSent: boolean("brochure_sent").notNull().default(false),

    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    nextFollowupAt: timestamp("next_followup_at", { withTimezone: true }),

    slaBreached: boolean("sla_breached").notNull().default(false),

    consentStatus: text("consent_status"),
    consentSource: text("consent_source"),
    consentAt: timestamp("consent_at", { withTimezone: true }),

    doNotContact: boolean("do_not_contact").notNull().default(false),
    optedOutChannels: text("opted_out_channels").array(),

    lostReason: text("lost_reason"),
    lostReasonDetail: text("lost_reason_detail"),
    lostAt: timestamp("lost_at", { withTimezone: true }),

    mergedIntoLeadId: uuid("merged_into_lead_id").references((): AnyPgColumn => leads.id, {
      onDelete: "set null",
    }),

    /** Escape hatch for custom fields (field_definitions, is_core = false) — no migration needed. */
    custom: jsonb("custom").$type<Record<string, unknown>>(),

    /**
     * The lead's own student-profile-form link. One per lead, minted on
     * demand by the counsellor, so the form arrives already bound to the
     * person it is about — no identity matching, no chance of a submission
     * landing on the wrong record.
     *
     * Nullable because most leads never reach this stage: the form goes
     * out only once sales have confirmed the student is joining.
     */
    profileFormToken: text("profile_form_token").unique(),
    profileFormSentAt: timestamp("profile_form_sent_at", { withTimezone: true }),
    profileFormSubmittedAt: timestamp("profile_form_submitted_at", { withTimezone: true }),
    /** The student's own answers, keyed by student field_definitions.key. */
    profileFormData: jsonb("profile_form_data").$type<Record<string, unknown>>(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [uniqueIndex("leads_lead_number_uq").on(t.leadNumber)],
);

export const identifierKindEnum = pgEnum("identifier_kind", ["phone", "email"]);

export const leadIdentifiers = pgTable(
  "lead_identifiers",
  {
    id: idColumn(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    kind: identifierKindEnum("kind").notNull(),
    /** Phones: E.164 via normalizePhone(). Emails: lowercased/trimmed. */
    valueNormalised: text("value_normalised").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex("lead_identifiers_kind_value_uq")
      .on(t.kind, t.valueNormalised)
      .where(sql`deleted_at is null`),
  ],
);

/**
 * One row per inbound event — a form fill, an ad lead, a walk-in. Many
 * enquiries per lead is what makes source attribution honest: lead volume
 * by source is a count of enquiries, unique-people volume is a count of
 * leads. Never updated after insert; the record of what actually happened.
 */
export const enquiries = pgTable("enquiries", {
  id: idColumn(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  subSource: text("sub_source"),
  campaignId: text("campaign_id"),
  adsetId: text("adset_id"),
  adId: text("ad_id"),
  utm: jsonb("utm").$type<Record<string, unknown>>(),
  gclid: text("gclid"),
  fbclid: text("fbclid"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  raw: jsonb("raw").$type<Record<string, unknown>>(),
  dedupeKey: text("dedupe_key"),
  wasDuplicate: boolean("was_duplicate").notNull().default(false),
  ingestBatchId: uuid("ingest_batch_id"),
  ...timestamps(),
});

export const leadMerges = pgTable("lead_merges", {
  id: idColumn(),
  survivorLeadId: uuid("survivor_lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "restrict" }),
  mergedLeadId: uuid("merged_lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "restrict" }),
  mergedBy: uuid("merged_by").references(() => profiles.id, { onDelete: "set null" }),
  reason: text("reason"),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
  ...timestamps(),
});

export const mergeReviewStatusEnum = pgEnum("merge_review_status", [
  "pending",
  "confirmed",
  "rejected",
]);

/**
 * Where resolveOrCreateLead() parks a match it isn't confident enough to
 * make automatically (e.g. same name + district, different phone) —
 * never guessed, never dropped.
 */
export const mergeReviewQueue = pgTable("merge_review_queue", {
  id: idColumn(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  candidateLeadId: uuid("candidate_lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  score: numeric("score", { precision: 5, scale: 2 }),
  status: mergeReviewStatusEnum("status").notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
  ...timestamps(),
});

/**
 * Written ONLY by a database trigger on leads.stage_id (docs/03-V1-AUDIT.md
 * D6) — v1 wrote this from one endpoint and missed every other path, so its
 * time-in-stage data was silently incomplete. Application code never
 * inserts here directly; there is no INSERT policy granting it.
 */
export const stageHistory = pgTable("stage_history", {
  id: idColumn(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  fromStage: uuid("from_stage").references(() => pipelineStages.id, { onDelete: "set null" }),
  toStage: uuid("to_stage")
    .notNull()
    .references(() => pipelineStages.id, { onDelete: "restrict" }),
  changedBy: uuid("changed_by").references(() => profiles.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  durationInPreviousSeconds: integer("duration_in_previous_seconds"),
});
