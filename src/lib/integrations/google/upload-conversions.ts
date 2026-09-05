import "server-only";

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { enquiries, enrolments, googleConversionUploads } from "@/lib/db/schema";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";

import { getGoogleAdsAccessToken } from "./ads-client";
import { uploadClickConversions } from "./audience-client";
import {
  formatConversionDateTime,
  planConversions,
  toConversionValue,
  type ConversionCandidate,
} from "./offline-conversions";

/**
 * Tells Google Ads which clicks actually became students.
 *
 * As far as Google currently knows, AFD's conversion is a form
 * submission — so Smart Bidding has spent a year buying the cheapest form
 * fills it can find, which is not the same as buying students. This sends
 * the truth back: this GCLID, eleven days later, enrolled and paid.
 *
 * The conversion reported is the SECOND gate, not the first. A confirmed
 * admission is a counsellor's opinion; a cleared payment is money, and
 * teaching Google to buy people who say yes and never pay would be worse
 * than teaching it nothing at all.
 *
 * Lives here rather than in the route so both the route and the Google ad
 * spend sync can call it without importing one route module from another.
 */
export interface ConversionRunResult {
  candidates: number;
  uploaded: number;
  failed: number;
  skipped: number;
  reason?: string;
}

export async function uploadConversions(): Promise<ConversionRunResult> {
  const empty = { candidates: 0, uploaded: 0, failed: 0, skipped: 0 };

  const credentials = await getIntegrationCredentials("google", [
    "client_id",
    "client_secret",
    "refresh_token",
    "developer_token",
    "customer_id",
    "login_customer_id",
    "conversion_action",
  ]);

  const conversionAction = credentials.conversion_action;
  if (!conversionAction) {
    // Not an error. Most of this integration works without it; an admin
    // has simply not created the "Import — from clicks" action yet.
    return { ...empty, reason: "No conversion action configured." };
  }
  if (
    !credentials.client_id ||
    !credentials.client_secret ||
    !credentials.refresh_token ||
    !credentials.developer_token ||
    !credentials.customer_id
  ) {
    return { ...empty, reason: "Google Ads isn't connected." };
  }

  // Admissions that have cleared their first payment. The gate that means
  // money changed hands.
  const paid = await db
    .select({
      id: enrolments.id,
      leadId: enrolments.leadId,
      netFeePaise: enrolments.netFeePaise,
      convertedAt: enrolments.accountsToAcademicsAt,
      droppedAt: enrolments.droppedAt,
    })
    .from(enrolments)
    .where(and(isNotNull(enrolments.accountsToAcademicsAt), isNull(enrolments.deletedAt)));

  if (paid.length === 0) return { ...empty, reason: "No paid admissions yet." };

  // The click that started it. First-touch, not last: the GCLID on the
  // FIRST Google enquiry is the click Google should be credited for, and
  // it is also the one whose 90-day window is closest to expiring.
  const clickRows = await db
    .select({
      leadId: enquiries.leadId,
      gclid: enquiries.gclid,
      createdAt: enquiries.createdAt,
    })
    .from(enquiries)
    .where(
      and(
        isNotNull(enquiries.gclid),
        inArray(
          enquiries.leadId,
          paid.map((row) => row.leadId),
        ),
      ),
    );

  const clickByLead = new Map<string, { gclid: string; clickedAt: string }>();
  for (const row of clickRows) {
    if (!row.gclid) continue;
    const existing = clickByLead.get(row.leadId);
    const clickedAt = row.createdAt.toISOString();
    if (!existing || clickedAt < existing.clickedAt) {
      clickByLead.set(row.leadId, { gclid: row.gclid, clickedAt });
    }
  }

  const candidates: ConversionCandidate[] = paid.map((row) => {
    const click = clickByLead.get(row.leadId);
    return {
      enrolmentId: row.id,
      gclid: click?.gclid ?? null,
      clickedAt: click?.clickedAt ?? null,
      convertedAt: row.convertedAt?.toISOString() ?? null,
      valuePaise: row.netFeePaise,
      droppedAt: row.droppedAt?.toISOString() ?? null,
    };
  });

  const done = await db
    .select({ enrolmentId: googleConversionUploads.enrolmentId })
    .from(googleConversionUploads)
    .where(eq(googleConversionUploads.conversionAction, conversionAction));
  const alreadyUploaded = new Set(done.map((row) => row.enrolmentId));

  const plan = planConversions(candidates, alreadyUploaded, new Date().toISOString());

  // Skips are recorded so "nothing was uploaded" can be told apart from
  // "nobody came from Google". Only the ones with a real reason worth
  // keeping — "not a Google click" would write a row for every walk-in
  // the institute has ever taken.
  const worthRecording = plan.skipped.filter((row) => row.reason !== "Not a Google click.");
  for (const row of worthRecording) {
    await db
      .insert(googleConversionUploads)
      .values({
        enrolmentId: row.enrolmentId,
        conversionAction,
        status: "skipped",
        detail: row.reason,
      })
      .onConflictDoNothing();
  }

  if (plan.upload.length === 0) {
    return {
      candidates: candidates.length,
      uploaded: 0,
      failed: 0,
      skipped: plan.skipped.length,
      reason: "Nothing new to report.",
    };
  }

  const accessToken = await getGoogleAdsAccessToken(
    credentials.client_id,
    credentials.client_secret,
    credentials.refresh_token,
  );

  let uploaded = 0;
  let failed = 0;

  try {
    const result = await uploadClickConversions(
      credentials.customer_id,
      {
        accessToken,
        developerToken: credentials.developer_token,
        loginCustomerId: credentials.login_customer_id ?? undefined,
      },
      conversionAction,
      plan.upload.map((row) => ({
        gclid: row.gclid,
        conversionDateTime: formatConversionDateTime(row.convertedAt),
        value: toConversionValue(row.valuePaise),
        currency: "INR",
      })),
    );

    // Partial failure is expected and fine: one expired GCLID should not
    // stop the other thirty-nine. Google's per-row detail is recorded
    // against the batch rather than guessed at per row, because matching
    // its error indices back to rows is exactly the kind of bookkeeping
    // that goes subtly wrong and reports the wrong admission as failed.
    const detail = result.partialFailure
      ? JSON.stringify(result.partialFailure).slice(0, 900)
      : null;
    uploaded = result.uploaded;
    failed = plan.upload.length - result.uploaded;

    for (const [index, row] of plan.upload.entries()) {
      const ok = index < result.uploaded || !result.partialFailure;
      await db
        .insert(googleConversionUploads)
        .values({
          enrolmentId: row.enrolmentId,
          conversionAction,
          gclid: row.gclid,
          valuePaise: row.valuePaise,
          convertedAt: new Date(row.convertedAt),
          status: ok ? "uploaded" : "failed",
          detail: ok ? null : detail,
        })
        .onConflictDoNothing();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The whole call failed — bad credentials, a wrong conversion action,
    // Google being down. NOT recorded as uploaded, so the next run tries
    // again; recorded nowhere at all, so the unique index stays free for
    // a real attempt.
    return {
      candidates: candidates.length,
      uploaded: 0,
      failed: plan.upload.length,
      skipped: plan.skipped.length,
      reason: message,
    };
  }

  return { candidates: candidates.length, uploaded, failed, skipped: plan.skipped.length };
}
