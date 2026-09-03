import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { centers } from "./org";

/**
 * A public, tokenised registration form. An admin creates one, sends the
 * link to a prospective student, and the student fills in their own
 * details — which land as an ordinary enquiry through the same
 * `resolveOrCreateLead()` + `applyAssignment()` path every other source
 * uses (CLAUDE.md § Non-negotiables 8). It is a new front door, not a new
 * ingestion route.
 *
 * `field_keys` is what makes this configuration rather than code: it names
 * `field_definitions` rows (by key) to render, so an admin adds a question
 * to the public form by picking an existing lead field — including a
 * custom one they invented — with no migration and no deploy.
 *
 * The token is the only thing protecting the form, so it is generated
 * server-side from a CSPRNG and is long enough not to be guessable. It is
 * a capability to SUBMIT, never to read: nothing about existing leads is
 * reachable through it.
 */
export const registrationForms = pgTable(
  "registration_forms",
  {
    id: idColumn(),
    name: text("name").notNull(),
    /** URL segment in /r/<token>. Unique, unguessable, never reused. */
    token: text("token").notNull().unique(),
    /**
     * Where leads from this form are attributed. Kept as free text rather
     * than an FK to dropdown_options so a form can carry a campaign-ish
     * label ("Open Day Oct 2026") without polluting the source list.
     */
    source: text("source").notNull().default("Registration Form"),
    /**
     * Optional. When set, every lead from this form is created at this
     * centre; when null, the assignment rules decide as usual. A form
     * printed on a Kannur poster wants the former.
     */
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "set null" }),
    /** field_definitions.key values, in the order they should be asked. */
    fieldKeys: text("field_keys").array().notNull(),
    introText: text("intro_text"),
    successMessage: text("success_message"),
    /** Null means it never expires. Past means it stops accepting submissions. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /**
     * Deactivating is how a form is retired. Soft delete hides it from the
     * admin list; this stops it accepting submissions while keeping the
     * link's history intelligible.
     */
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [index("registration_forms_token_idx").on(table.token)],
);
