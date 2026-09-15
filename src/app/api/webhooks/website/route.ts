import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { webhookEvents } from "@/lib/db/schema";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { verifyMetaSignature } from "@/lib/integrations/meta/verify-signature";
import {
  mapWebsiteForm,
  submissionId,
  type WebsiteFormPayload,
} from "@/lib/integrations/website/map-form-fields";

export const dynamic = "force-dynamic";

/**
 * Enquiry forms on afdindia.com.
 *
 * The site's forms post to a Google Apps Script that appends a row to a
 * spreadsheet. That script now also POSTs here, so the CRM is the system
 * of record and the sheet becomes a backup rather than the destination —
 * which matters because a lead in a spreadsheet has no owner, no
 * response-time clock, and no place in any report. It was the institute's
 * cheapest source of leads and the slowest to answer.
 *
 * ## Verification
 *
 * The same HMAC scheme as Meta's, reusing `verifyMetaSignature` rather
 * than inventing a second one: the script signs the exact request body
 * with a shared secret and sends `sha256=<hex>` in `X-AFD-Signature`.
 * Apps Script can compute that in three lines
 * (`Utilities.computeHmacSha256Signature`), and unlike a bearer token it
 * cannot be lifted from the script and replayed against a different body.
 *
 * CLAUDE.md non-negotiable #9 in order: check the signature against the
 * raw body before parsing, persist the payload whether or not it passed,
 * then process. Non-negotiable #8: the lead goes through
 * `resolveOrCreateLead()` like every other source, so a website enquiry
 * from somebody who already called is the same person, not a duplicate.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-afd-signature");

  const { signing_secret: secret } = await getIntegrationCredentials("website", ["signing_secret"]);
  const signatureOk = Boolean(secret) && verifyMetaSignature(rawBody, signature, secret ?? "");

  let payload: WebsiteFormPayload | null = null;
  try {
    payload = JSON.parse(rawBody) as WebsiteFormPayload;
  } catch {
    payload = null;
  }

  if (!signatureOk || !payload) {
    await db.insert(webhookEvents).values({
      source: "website",
      externalId: `invalid:${randomUUID()}`,
      signatureOk,
      raw: (payload as Record<string, unknown>) ?? { unparsedBodyPreview: rawBody.slice(0, 2000) },
      status: "failed",
      lastError: !signatureOk
        ? "Invalid or missing X-AFD-Signature"
        : "Body was not valid JSON",
    });
    return NextResponse.json({ error: "Invalid request" }, { status: signatureOk ? 400 : 401 });
  }

  const externalId = submissionId(payload);

  const [inserted] = await db
    .insert(webhookEvents)
    .values({ source: "website", externalId, signatureOk: true, raw: payload as Record<string, unknown> })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });

  // Already handled on an earlier delivery. Apps Script retries on a
  // non-2xx, and a retried submission must not become a second lead.
  if (!inserted) return NextResponse.json({ ok: true, duplicate: true });

  const mapped = mapWebsiteForm(payload);

  if (!mapped.ok) {
    // A 200, deliberately. The submission is unusable — no name, or no
    // usable phone — and retrying it will produce exactly the same
    // result, so asking the script to send it again helps nobody. It is
    // recorded as failed with the reason, and visible on Settings →
    // Platform Health, which is where a broken form gets noticed.
    await db
      .update(webhookEvents)
      .set({ status: "failed", attempts: sql`${webhookEvents.attempts} + 1`, lastError: mapped.reason })
      .where(eq(webhookEvents.id, inserted.id));
    return NextResponse.json({ ok: false, error: mapped.reason });
  }

  try {
    await resolveOrCreateLead({
      studentName: mapped.lead.studentName,
      primaryPhone: mapped.lead.primaryPhone,
      email: mapped.lead.email,
      city: mapped.lead.city,
      examYear: mapped.lead.examYear,
      interestedExams: mapped.lead.interestedExams,
      coursesInterested: mapped.lead.coursesInterested,
      source: "Website",
      subSource: mapped.lead.subSource,
      raw: mapped.lead.raw,
      dedupeKey: externalId,
    });

    await db
      .update(webhookEvents)
      .set({ status: "done", processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` })
      .where(eq(webhookEvents.id, inserted.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    // A genuine failure — the database was unreachable, or something
    // unexpected threw. Non-2xx so the script retries, per non-negotiable
    // #9. V1 returned 200 on everything and lost leads invisibly.
    await db
      .update(webhookEvents)
      .set({
        status: "failed",
        attempts: sql`${webhookEvents.attempts} + 1`,
        lastError: error instanceof Error ? error.message : String(error),
      })
      .where(eq(webhookEvents.id, inserted.id));

    return NextResponse.json({ error: "Could not record the enquiry" }, { status: 500 });
  }
}
