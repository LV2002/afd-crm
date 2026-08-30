import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_helpers";

/**
 * "Plug and play" integrations (Meta, Google, WhatsApp, telephony): every
 * credential an admin types into a Settings screen lands here, encrypted,
 * instead of an env var — the whole point is that connecting a new ad
 * account or WhatsApp number needs no deploy. See
 * `src/lib/integrations/credentials.ts` for the encrypt/decrypt helpers
 * that are the only code allowed to touch `value_encrypted`.
 *
 * `scope_id` is null for an org-wide credential (Meta's app secret, a
 * Google Ads developer token) and a profile id for a per-counsellor one
 * (a WhatsApp Business number assigned to one counsellor) — deliberately
 * NOT a hard FK to `profiles`, so a credential can outlive the profile row
 * being deleted rather than silently cascading away a working integration;
 * `deleteIntegrationCredential()` is the only cleanup path.
 */
export const integrationProviderEnum = pgEnum("integration_provider", [
  "meta",
  "google",
  "whatsapp",
  "telephony",
]);

export const integrationCredentials = pgTable(
  "integration_credentials",
  {
    id: idColumn(),
    provider: integrationProviderEnum("provider").notNull(),
    key: text("key").notNull(),
    valueEncrypted: text("value_encrypted").notNull(),
    scopeId: uuid("scope_id"),
    ...timestamps(),
  },
  (t) => [
    // Two partial indexes rather than one plain unique(provider, key,
    // scope_id) — Postgres never treats two NULLs as conflicting under a
    // plain unique index, so that alone wouldn't stop two org-wide rows
    // for the same key.
    uniqueIndex("integration_credentials_org_key_uq")
      .on(t.provider, t.key)
      .where(sql`scope_id is null`),
    uniqueIndex("integration_credentials_scoped_key_uq")
      .on(t.provider, t.key, t.scopeId)
      .where(sql`scope_id is not null`),
  ],
);
