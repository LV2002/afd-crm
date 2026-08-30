// No `import "server-only"` here, for the same reason as
// `seed-permissions.ts`/`import-config.ts`: that package throws under a
// plain Node process (tsx, Vitest), not just under webpack — and this
// module's tests and any future CLI tooling need to import it directly.
// The real boundary is `integration_credentials`' own RLS (no policies for
// any authenticated role, see migration 0022) plus this always running on
// the direct db client — never that this marker is present.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { integrationCredentials, type integrationProviderEnum } from "@/lib/db/schema";

export type IntegrationProvider = (typeof integrationProviderEnum.enumValues)[number];

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * AES-256-GCM, keyed by `INTEGRATION_ENCRYPTION_KEY` — a base64-encoded
 * 32-byte key that must live in the deploy environment, never the
 * database (this is the one thing about "plug and play" that genuinely
 * needs a deploy: bootstrapping the key that everything else is encrypted
 * under can't itself be a database row). Generate one with
 * `openssl rand -base64 32`. Rotating it means re-encrypting every stored
 * credential — not attempted here; treat it as a one-time setup value.
 */
function getKey(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and set it in the environment.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes — generate with `openssl rand -base64 32`.");
  }
  return key;
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64")).join(".");
}

function decrypt(stored: string): string {
  const [ivB64, tagB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted credential (expected iv.authTag.ciphertext)");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
}

function scopeCondition(scopeId: string | null) {
  return scopeId ? eq(integrationCredentials.scopeId, scopeId) : isNull(integrationCredentials.scopeId);
}

/**
 * Writes one credential, encrypted. Runs on the direct db client — same
 * trust boundary as `resolveOrCreateLead()`/config import (see
 * docs/DECISIONS.md) — because `integration_credentials` has no
 * INSERT/UPDATE/SELECT RLS policy for any authenticated role at all
 * (migration comment explains why): nobody should ever be able to read a
 * secret back through the browser, encrypted or not, so there's no
 * RLS-bound path that could work here anyway. The caller (a Server Action
 * gated on `settings.manage`) is the only enforcement point.
 *
 * A manual select-then-update-or-insert, not `onConflictDoUpdate()`: with
 * `scope_id` nullable, the real uniqueness constraint is two *partial*
 * indexes (see the schema), and a single upsert can't target either one
 * generically. Credentials are written rarely (an admin typing them into
 * a form), so the extra round-trip inside one transaction costs nothing
 * real.
 */
export async function setIntegrationCredential(
  provider: IntegrationProvider,
  key: string,
  value: string,
  scopeId: string | null = null,
): Promise<void> {
  const valueEncrypted = encrypt(value);
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: integrationCredentials.id })
      .from(integrationCredentials)
      .where(and(eq(integrationCredentials.provider, provider), eq(integrationCredentials.key, key), scopeCondition(scopeId)));

    if (existing) {
      await tx.update(integrationCredentials).set({ valueEncrypted }).where(eq(integrationCredentials.id, existing.id));
    } else {
      await tx.insert(integrationCredentials).values({ provider, key, valueEncrypted, scopeId });
    }
  });
}

/** Returns the decrypted value, or null if never set. */
export async function getIntegrationCredential(
  provider: IntegrationProvider,
  key: string,
  scopeId: string | null = null,
): Promise<string | null> {
  const [row] = await db
    .select({ valueEncrypted: integrationCredentials.valueEncrypted })
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.provider, provider), eq(integrationCredentials.key, key), scopeCondition(scopeId)));

  return row ? decrypt(row.valueEncrypted) : null;
}

/** Fetches several keys for one provider/scope at once — e.g. every Meta credential needed to build a webhook or Insights request. */
export async function getIntegrationCredentials(
  provider: IntegrationProvider,
  keys: string[],
  scopeId: string | null = null,
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(keys.map(async (key) => [key, await getIntegrationCredential(provider, key, scopeId)] as const));
  return Object.fromEntries(entries);
}

export async function deleteIntegrationCredential(
  provider: IntegrationProvider,
  key: string,
  scopeId: string | null = null,
): Promise<void> {
  await db
    .delete(integrationCredentials)
    .where(and(eq(integrationCredentials.provider, provider), eq(integrationCredentials.key, key), scopeCondition(scopeId)));
}

/**
 * Reverse lookup: given a credential's decrypted value, find which scope
 * (e.g. which counsellor's profile id) it belongs to — needed to route an
 * inbound WhatsApp webhook delivery to the counsellor who owns the
 * `phone_number_id` it arrived on. Decrypts every scoped row for
 * `(provider, key)` to compare, since encryption is non-deterministic
 * (a fresh IV each time) and can't be searched by ciphertext. Fine at this
 * system's real scale — a handful of counsellors, not thousands — and
 * only ever called once per inbound webhook delivery, not in a hot path.
 */
export async function findScopeIdByCredentialValue(
  provider: IntegrationProvider,
  key: string,
  value: string,
): Promise<string | null> {
  const rows = await db
    .select({ scopeId: integrationCredentials.scopeId, valueEncrypted: integrationCredentials.valueEncrypted })
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.provider, provider), eq(integrationCredentials.key, key)));

  for (const row of rows) {
    if (row.scopeId && decrypt(row.valueEncrypted) === value) {
      return row.scopeId;
    }
  }
  return null;
}

/** True if a credential has been set — for a settings screen to show "Connected" without ever decrypting the value. */
export async function hasIntegrationCredential(
  provider: IntegrationProvider,
  key: string,
  scopeId: string | null = null,
): Promise<boolean> {
  const [row] = await db
    .select({ id: integrationCredentials.id })
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.provider, provider), eq(integrationCredentials.key, key), scopeCondition(scopeId)));
  return Boolean(row);
}
