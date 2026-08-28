import { jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_helpers";
import { profiles } from "./auth";

export const configSnapshotKindEnum = pgEnum("config_snapshot_kind", ["export", "import"]);

/**
 * CLAUDE.md § Plug-and-play test: every configuration table dumped to one
 * JSON bundle, importable into a fresh instance to produce a working,
 * differently-shaped CRM with no data. This table is the record of that —
 * every export and every import leaves a row here, so an admin has a
 * re-downloadable history rather than having to keep the file safe
 * themselves.
 *
 * `version` is the bundle FORMAT version (bumped only if the shape of the
 * exported JSON itself changes), not a counter of how many times you've
 * exported — that's what `created_at` ordering is for.
 *
 * Append-only, same shape as `stage_history`/`assignment_history`: no
 * update policy, no application code ever mutates a row after insert.
 */
export const configSnapshots = pgTable("config_snapshots", {
  id: idColumn(),
  name: text("name").notNull(),
  kind: configSnapshotKindEnum("kind").notNull(),
  version: text("version").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  ...timestamps(),
});
