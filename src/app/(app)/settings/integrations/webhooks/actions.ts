"use server";

import { randomBytes } from "node:crypto";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { customWebhooks, dropdownOptions, enquiries } from "@/lib/db/schema";
import { ALIASES } from "@/lib/integrations/form-payload/map-fields";
import { createClient } from "@/lib/supabase/server";

/**
 * The platforms whose spend Ad Performance can join to.
 *
 * Exactly `ad_spend_daily.platform`'s values. Not a free-text box: a
 * typo here would silently detach a campaign's leads from its spend,
 * and the report would show the two side by side as unrelated rows.
 */
const AD_PLATFORMS = ["google", "meta"];

export interface WebhookFormState {
  error?: string;
  success?: string;
}

/**
 * 32 random bytes, hex. The URL token and the signing secret are both
 * generated here and never derived from anything typed: for an endpoint
 * with signature checking off, the token in the URL is the whole of the
 * authentication, so it has to be unguessable rather than memorable.
 */
function token(): string {
  return randomBytes(32).toString("hex");
}

/** The alias groups an admin may add their own spellings to. */
const ALIAS_KEYS = Object.keys(ALIASES);

/**
 * `phone: mob, mobile_no` per line, which is what somebody looking at a
 * failed delivery can actually type. Stored as
 * `{"phone": ["mob", "mobile_no"]}`.
 */
function parseAliases(raw: string): { ok: true; value: Record<string, string[]> | null } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };

  const out: Record<string, string[]> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const at = trimmed.indexOf(":");
    if (at < 1) {
      return { ok: false, error: `"${trimmed}" needs to read like  phone: mob, mobile_no` };
    }
    const field = trimmed.slice(0, at).trim();
    if (!ALIAS_KEYS.includes(field)) {
      return {
        ok: false,
        error: `"${field}" is not a field this can map. Use one of: ${ALIAS_KEYS.join(", ")}.`,
      };
    }
    const names = trimmed
      .slice(at + 1)
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length === 0) return { ok: false, error: `"${field}" has no field names after the colon.` };
    out[field] = [...(out[field] ?? []), ...names];
  }

  return { ok: true, value: Object.keys(out).length > 0 ? out : null };
}

/** `{"phone": ["mob"]}` back to the text the form shows. */
export async function formatAliases(value: Record<string, string[]> | null): Promise<string> {
  if (!value) return "";
  return Object.entries(value)
    .map(([field, names]) => `${field}: ${names.join(", ")}`)
    .join("\n");
}

/**
 * Creates or updates one endpoint.
 *
 * The source name is also upserted into `dropdown_options` under
 * `lead_source`. Without that, the sources report would show a value
 * nobody configured — present in the data, absent from every filter — and
 * the point of giving each feed its own source name is being able to
 * group by it.
 */
export async function saveCustomWebhook(
  _prev: WebhookFormState,
  formData: FormData,
): Promise<WebhookFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const subSource = String(formData.get("subSource") ?? "").trim() || null;
  const centerId = String(formData.get("centerId") ?? "").trim() || null;
  const requireSignature = formData.get("requireSignature") === "on";
  const wantsAuthToken = formData.get("requireAuthToken") === "on";
  const adPlatformRaw = String(formData.get("adPlatform") ?? "").trim();
  const adPlatform = AD_PLATFORMS.includes(adPlatformRaw) ? adPlatformRaw : null;

  if (!name) return { error: "Give it a name you will recognise in six months." };
  if (!source) return { error: "Give it a source name — it is what the reports group by." };

  const aliases = parseAliases(String(formData.get("fieldAliases") ?? ""));
  if (!aliases.ok) return { error: aliases.error };

  if (id) {
    const [existing] = await db
      .select({ id: customWebhooks.id, authToken: customWebhooks.authToken })
      .from(customWebhooks)
      .where(and(eq(customWebhooks.id, id), isNull(customWebhooks.deletedAt)));
    if (!existing) return { error: "That webhook no longer exists." };

    await db
      .update(customWebhooks)
      .set({
        name,
        source,
        subSource,
        centerId,
        requireSignature,
        /*
          Generated on the save that first asks for one, and kept
          untouched by every save afterwards.

          The alternative — regenerate whenever the box is ticked — would
          silently invalidate a key already pasted into a sender's
          settings every time somebody edited the source name. Clearing it
          is the only destructive direction, and that is what unticking
          the box means.
        */
        authToken: wantsAuthToken ? (existing.authToken ?? token()) : null,
        adPlatform,
        fieldAliases: aliases.value,
        updatedAt: new Date(),
      })
      .where(eq(customWebhooks.id, id));

    /*
      Catch up the enquiries this endpoint has already written.

      Without this, turning the setting on would attribute next week's
      leads and leave last week's invisible — the report would show a
      campaign's spend against a fraction of what it produced, which is
      worse than showing none of it. Matched on the source, which is
      exact rather than a guess: this endpoint stamps that same string
      on every enquiry it creates.

      Only rows with no platform yet, so an endpoint whose source was
      later reused cannot overwrite an attribution something else made.
      Clearing the setting clears them back, for the same reason: the
      figures should follow the decision both ways.
    */
    await db
      .update(enquiries)
      .set({ adPlatform })
      .where(
        and(
          eq(enquiries.source, source),
          adPlatform === null ? isNotNull(enquiries.adPlatform) : isNull(enquiries.adPlatform),
        ),
      );
  } else {
    await db.insert(customWebhooks).values({
      name,
      slug: token(),
      source,
      subSource,
      centerId,
      signingSecret: token(),
      requireSignature,
      authToken: wantsAuthToken ? token() : null,
      adPlatform,
      fieldAliases: aliases.value,
      createdBy: user.id,
    });
  }

  // The source has to exist as an option or it is invisible to every
  // filter and every report. Inserted only when missing, so an admin who
  // has since renamed the label keeps their wording.
  await db
    .insert(dropdownOptions)
    .values({ category: "lead_source", value: source, label: source, sortOrder: 100 })
    .onConflictDoNothing({ target: [dropdownOptions.category, dropdownOptions.value] });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: id ? "custom_webhook.update" : "custom_webhook.create",
    entityType: "custom_webhooks",
    entityId: id ?? undefined,
    // Whether a key is expected, never the key. An audit row is read by
    // people and kept for ever.
    after: {
      name,
      source,
      subSource,
      centerId,
      requireSignature,
      hasAuthToken: wantsAuthToken,
      adPlatform,
    },
  });

  revalidatePath("/settings/integrations/webhooks");
  revalidatePath("/settings/integrations");
  // Ad Performance reads the attribution this just changed.
  revalidatePath("/marketing");
  return { success: id ? `Saved ${name}.` : `Created ${name}. Its URL is below.` };
}

/** Switches an endpoint off without losing its history, or back on. */
export async function setCustomWebhookActive(id: string, isActive: boolean): Promise<WebhookFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const [row] = await db
    .select({ name: customWebhooks.name })
    .from(customWebhooks)
    .where(and(eq(customWebhooks.id, id), isNull(customWebhooks.deletedAt)));
  if (!row) return { error: "That webhook no longer exists." };

  await db
    .update(customWebhooks)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(customWebhooks.id, id));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "custom_webhook.update",
    entityType: "custom_webhooks",
    entityId: id,
    after: { isActive },
  });

  revalidatePath("/settings/integrations/webhooks");
  return {
    success: isActive
      ? `${row.name} is live again.`
      : `${row.name} is off. Anything posted to it now gets a 404.`,
  };
}

/**
 * New URL and new secret for one endpoint.
 *
 * Both at once, deliberately. They are the two halves of the same
 * credential, and the reason to replace either — it was pasted somewhere
 * it should not have been — applies to both.
 *
 * The old URL stops working the moment this returns, so the sender has to
 * be updated. The screen says so before the button.
 */
export async function rotateCustomWebhookCredentials(id: string): Promise<WebhookFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const [row] = await db
    .select({ name: customWebhooks.name, authToken: customWebhooks.authToken })
    .from(customWebhooks)
    .where(and(eq(customWebhooks.id, id), isNull(customWebhooks.deletedAt)));
  if (!row) return { error: "That webhook no longer exists." };

  await db
    .update(customWebhooks)
    .set({
      slug: token(),
      signingSecret: token(),
      // Replaced only if there is one. Rotating is "assume everything
      // this endpoint ever handed out is compromised", and the key is
      // part of that — but an endpoint that never had one must not
      // acquire a requirement from a button labelled "new URL & secret".
      ...(row.authToken ? { authToken: token() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(customWebhooks.id, id));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "custom_webhook.rotate",
    entityType: "custom_webhooks",
    entityId: id,
    // Never the values themselves. An audit row is read by people and
    // kept forever; a credential in one is a credential with a very long
    // tail.
    after: { rotated: true },
  });

  revalidatePath("/settings/integrations/webhooks");
  return {
    success: row.authToken
      ? `New URL, secret and authentication key for ${row.name}. Update the sender before its next send.`
      : `New URL and secret for ${row.name}. Update the sender before its next send.`,
  };
}

/**
 * Removes an endpoint.
 *
 * Soft, like everything else (non-negotiable #5): the deliveries it
 * received stay on `webhook_events` and still point at this row, so
 * "where did these forty leads come from" stays answerable after somebody
 * tidies up.
 */
export async function deleteCustomWebhook(id: string): Promise<WebhookFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const [row] = await db
    .select({ name: customWebhooks.name })
    .from(customWebhooks)
    .where(and(eq(customWebhooks.id, id), isNull(customWebhooks.deletedAt)));
  if (!row) return { error: "That webhook no longer exists." };

  await db
    .update(customWebhooks)
    .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(eq(customWebhooks.id, id));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "custom_webhook.delete",
    entityType: "custom_webhooks",
    entityId: id,
    before: { name: row.name },
  });

  revalidatePath("/settings/integrations/webhooks");
  revalidatePath("/settings/integrations");
  return { success: `Deleted ${row.name}. Its past deliveries are still on the record.` };
}
