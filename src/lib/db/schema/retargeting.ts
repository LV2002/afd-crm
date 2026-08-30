import { pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn } from "./_helpers";
import { adPlatformEnum } from "./ad-spend";
import { leads } from "./leads";

/**
 * Membership state for the daily retargeting sync (Meta Custom Audiences,
 * Google Customer Match) — one row per (platform, lead) currently believed
 * to be uploaded to that platform's audience. Exists so each day's sync
 * can compute a real diff (`src/lib/integrations/audience-sync.ts`)
 * against who's *currently eligible* (consent given, not opted out, not
 * do-not-contact) rather than only ever adding: a lead whose consent is
 * withdrawn or who is later marked do-not-contact has to come back OUT of
 * a live ad platform audience, not just stop being added to it.
 *
 * `onDelete: cascade` on `lead_id`: if a lead is ever hard-deleted (never
 * happens today, CLAUDE.md non-negotiable #5, but the FK still needs a
 * policy), there is nothing left to remove from the platform for — the
 * row cleaning itself up is correct, not a data-loss risk, since the
 * platform-side membership will simply age out or get overwritten by a
 * future full sync in that case.
 */
export const adAudienceMembers = pgTable(
  "ad_audience_members",
  {
    id: idColumn(),
    platform: adPlatformEnum("platform").notNull(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ad_audience_members_platform_lead_id_uq").on(t.platform, t.leadId)],
);
