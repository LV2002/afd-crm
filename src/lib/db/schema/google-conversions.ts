import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_helpers";
import { enrolments } from "./finance";

/**
 * What has been reported back to Google Ads, and what happened.
 *
 * Google optimises against whatever you tell it converted. Telling it
 * about the same admission twice teaches it that one click was worth
 * twice what it was, and the money follows that lie — so the unique index
 * on (enrolment, conversion action) is the entire point of this table,
 * not bookkeeping around it. A retry after a timeout hits the index and
 * does nothing.
 *
 * Failures and skips are rows too. "Nothing was uploaded" is
 * indistinguishable from "everything already had been" and from "no
 * admission this month came from a Google click", and somebody asking why
 * their bidding has not improved needs to be able to tell those apart.
 */
export const googleConversionUploads = pgTable(
  "google_conversion_uploads",
  {
    id: idColumn(),
    enrolmentId: uuid("enrolment_id")
      .notNull()
      .references(() => enrolments.id, { onDelete: "cascade" }),
    /** The conversion action it was reported against — part of the uniqueness. */
    conversionAction: text("conversion_action").notNull(),
    gclid: text("gclid"),
    /** What Google was told it was worth, kept in paise like all money here. */
    valuePaise: bigint("value_paise", { mode: "number" }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    /** uploaded | failed | skipped */
    status: text("status").notNull(),
    detail: text("detail"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("google_conversion_uploads_enrolment_action_uq").on(t.enrolmentId, t.conversionAction),
    index("google_conversion_uploads_status_idx").on(t.status),
  ],
);
