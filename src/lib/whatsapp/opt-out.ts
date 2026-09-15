import { and, eq, inArray, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { db } from "@/lib/db/client";
import { leads, whatsappSuppressions } from "@/lib/db/schema";
import { normalizePhone } from "@/lib/identity/normalize-phone";

/**
 * "Stop messaging me."
 *
 * WhatsApp expects a business to honour an opt-out, and sending to
 * somebody who has asked you to stop is the kind of thing that costs a
 * number its quality rating and, eventually, its access. Since AFD now
 * runs the whole institute's marketing on one number, that is not a risk
 * anybody wants to carry.
 *
 * Suppression is by phone number rather than by lead. Somebody typing
 * STOP is speaking for the number in their hand, they may not be a lead
 * at all (this number sends marketing; enquiries arrive elsewhere), and a
 * parent whose number sits on two siblings' records should be suppressed
 * once rather than twice.
 *
 * The keywords themselves are `dropdown_options`, not constants —
 * "configuration is data" (CLAUDE.md § 10). An institute that wants to
 * honour a Malayalam word, or wants STOP to mean nothing, edits a list in
 * Settings → Dropdowns rather than waiting for a deploy.
 */

export {
  OPT_IN_KEYWORD_CATEGORY,
  OPT_OUT_KEYWORD_CATEGORY,
  matchesKeyword,
  normaliseKeywordText,
} from "./opt-out-keywords";

/** Records an opt-out. Idempotent: a second STOP from a number already suppressed changes nothing. */
export async function suppressPhone(
  tx: DbExecutor,
  input: { phone: string; reason?: string | null; source?: "keyword" | "manual"; createdBy?: string | null },
): Promise<boolean> {
  const phone = normalizePhone(input.phone) ?? input.phone.trim();
  if (!phone) return false;

  const [existing] = await tx
    .select({ id: whatsappSuppressions.id })
    .from(whatsappSuppressions)
    .where(and(eq(whatsappSuppressions.phone, phone), isNull(whatsappSuppressions.releasedAt)));
  if (existing) return false;

  await tx.insert(whatsappSuppressions).values({
    phone,
    reason: input.reason ?? null,
    source: input.source ?? "keyword",
    createdBy: input.createdBy ?? null,
  });

  // Keep the lead's own consent record in step. Suppression by phone is
  // what actually stops a send, but a lead row still reading "opted in"
  // after the person said STOP is a record that contradicts itself — and
  // it is the lead, not the suppression list, that a counsellor looks at
  // before picking up the phone.
  await tx
    .update(leads)
    .set({ consentStatus: "withdrawn", consentSource: "opt_out", consentAt: new Date() })
    .where(eq(leads.primaryPhone, phone));

  return true;
}

/**
 * Lifts an opt-out — because they asked to come back, or because somebody
 * recorded it against the wrong number.
 *
 * The row is kept and marked released rather than deleted: "we stopped on
 * the 3rd, they asked back on the 9th" is the answer to a complaint, and
 * a deleted row answers nothing.
 */
export async function releasePhone(
  tx: DbExecutor,
  input: { phone: string; releasedBy?: string | null },
): Promise<boolean> {
  const phone = normalizePhone(input.phone) ?? input.phone.trim();
  if (!phone) return false;

  const released = await tx
    .update(whatsappSuppressions)
    .set({ releasedAt: new Date(), releasedBy: input.releasedBy ?? null })
    .where(and(eq(whatsappSuppressions.phone, phone), isNull(whatsappSuppressions.releasedAt)))
    .returning({ id: whatsappSuppressions.id });

  // Coming back is a deliberate act — an explicit START, or somebody on
  // the suppressions screen acting on a request — so unlike a repeat
  // enquiry it does restore consent. Only for a lead this actually
  // withdrew, never one that was already something else.
  if (released.length > 0) {
    await tx
      .update(leads)
      .set({ consentStatus: "given", consentSource: "opt_in", consentAt: new Date() })
      .where(and(eq(leads.primaryPhone, phone), eq(leads.consentStatus, "withdrawn")));
  }

  return released.length > 0;
}

/** True if this number has a live suppression. Used at send time, not only at compose time. */
export async function isSuppressed(phone: string): Promise<boolean> {
  const normalised = normalizePhone(phone) ?? phone.trim();
  if (!normalised) return false;
  const [row] = await db
    .select({ id: whatsappSuppressions.id })
    .from(whatsappSuppressions)
    .where(and(eq(whatsappSuppressions.phone, normalised), isNull(whatsappSuppressions.releasedAt)));
  return Boolean(row);
}

/**
 * The live suppressions among a set of numbers, normalised.
 *
 * One query for a whole audience rather than one per person: a broadcast
 * to four hundred people would otherwise be four hundred round trips
 * before it sent anything.
 */
export async function suppressedAmong(
  executor: DbExecutor,
  phones: string[],
): Promise<Set<string>> {
  const normalised = phones
    .map((phone) => normalizePhone(phone) ?? phone.trim())
    .filter((phone) => phone.length > 0);
  if (normalised.length === 0) return new Set();

  const rows = await executor
    .select({ phone: whatsappSuppressions.phone })
    .from(whatsappSuppressions)
    .where(
      and(
        inArray(whatsappSuppressions.phone, Array.from(new Set(normalised))),
        isNull(whatsappSuppressions.releasedAt),
      ),
    );
  return new Set(rows.map((row) => row.phone));
}
