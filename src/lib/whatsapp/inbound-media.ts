import "server-only";

import { and, asc, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { whatsappMessages } from "@/lib/db/schema";
import { captureError } from "@/lib/errors/capture";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { ATTACHMENTS_BUCKET } from "@/lib/storage/shared";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Fetching the pictures students send us.
 *
 * Sending images and video has worked since Session 35. Receiving them
 * never has: an inbound picture was recorded by Meta's media id and the
 * bytes were never fetched, so a counsellor could see that a student had
 * sent *something* and not what it was. A photo of a mark sheet, a
 * screenshot of a payment — exactly the things somebody needs to look at.
 *
 * ## The 30-day clock
 *
 * Meta keeps inbound media for thirty days and then deletes it. An id
 * that is never redeemed is not a deferred feature, it is a permanently
 * missing message — which is why this retries rather than trying once,
 * and why it stops at five attempts rather than never.
 *
 * ## Two hops, both authenticated
 *
 * Meta's media API does not hand over bytes directly. `GET /{media_id}`
 * returns a short-lived URL, and that URL then needs the SAME bearer
 * token — it is not a public link. Missing the second header is the
 * classic way this integration silently returns HTML error pages instead
 * of images.
 */

/** Bigger than any photo a phone sends, smaller than a video worth blocking a request on. */
const INLINE_LIMIT_BYTES = 5 * 1024 * 1024;

/** Meta's own ceiling for inbound media. Anything larger is a bug in the payload, not a big file. */
const HARD_LIMIT_BYTES = 100 * 1024 * 1024;

/** After this many failures the id is almost certainly expired. Stop, and say so. */
const MAX_ATTEMPTS = 5;

const GRAPH_VERSION = "v21.0";

interface MediaMeta {
  url: string;
  mimeType: string;
  fileSize: number;
  sha256?: string;
}

async function fetchMediaMeta(mediaId: string, accessToken: string): Promise<MediaMeta> {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `Meta returned ${response.status} looking up the media: ${body?.error?.message ?? "unknown"}`,
    );
  }
  return {
    url: String(body.url),
    mimeType: String(body.mime_type ?? "application/octet-stream"),
    fileSize: Number(body.file_size ?? 0),
    sha256: body.sha256 ? String(body.sha256) : undefined,
  };
}

/** A name a person would recognise in a file listing, derived from the mime type. */
function filenameFor(mediaId: string, mimeType: string): string {
  const extension =
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/3gpp": "3gp",
      "audio/ogg": "ogg",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/amr": "amr",
      "application/pdf": "pdf",
    }[mimeType.split(";")[0].trim()] ?? "bin";
  return `whatsapp-${mediaId.slice(-12)}.${extension}`;
}

export interface DownloadOutcome {
  ok: boolean;
  reason?: string;
}

/**
 * Fetches one message's media into the private attachments bucket.
 *
 * Uses the service-role client for the upload, the same as every other
 * server-side write to storage: the bytes arrive from a webhook or a
 * sweep, neither of which has a user session to write as. Reading them
 * back still goes through a short-lived signed URL, so the bucket stays
 * private and nothing about the existing trust model changes.
 */
export async function downloadMessageMedia(message: {
  id: string;
  mediaId: string | null;
  mediaMimeType: string | null;
  leadId: string | null;
  attempts: number;
}): Promise<DownloadOutcome> {
  if (!message.mediaId) return { ok: false, reason: "No media on this message." };

  const { access_token: accessToken } = await getIntegrationCredentials("whatsapp", [
    "access_token",
  ]);
  if (!accessToken) {
    // Not counted as an attempt: the credential will exist one day and
    // burning the retry budget while it doesn't would lose the media.
    return { ok: false, reason: "WhatsApp isn't connected." };
  }

  try {
    const meta = await fetchMediaMeta(message.mediaId, accessToken);

    if (meta.fileSize > HARD_LIMIT_BYTES) {
      await markFailed(message.id, `Too large to store (${Math.round(meta.fileSize / 1e6)} MB).`);
      return { ok: false, reason: "Too large." };
    }

    // The second hop. This URL is short-lived AND still needs the bearer
    // token — without it Meta returns an error page with a 200, and you
    // end up storing HTML as a JPEG.
    const file = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!file.ok) throw new Error(`Meta returned ${file.status} downloading the media.`);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error("Meta returned an empty file.");

    const mimeType = meta.mimeType || message.mediaMimeType || "application/octet-stream";
    const filename = filenameFor(message.mediaId, mimeType);
    // Filed under the lead where a counsellor would look for it; unmatched
    // replies (a number nobody has entered) get their own folder rather
    // than being dropped.
    const path = `whatsapp/${message.leadId ?? "unmatched"}/${message.id}/${filename}`;

    const supabase = createServiceRoleClient();
    const { error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: true });
    if (error) throw new Error(`Could not store the file: ${error.message}`);

    await db
      .update(whatsappMessages)
      .set({
        mediaStoragePath: path,
        mediaFilename: filename,
        mediaMimeType: mimeType,
        mediaSizeBytes: bytes.byteLength,
        mediaDownloadedAt: new Date(),
        mediaError: null,
        mediaAttempts: message.attempts + 1,
      })
      .where(sql`${whatsappMessages.id} = ${message.id}`);

    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markFailed(message.id, reason, message.attempts + 1);
    return { ok: false, reason };
  }
}

async function markFailed(id: string, reason: string, attempts?: number): Promise<void> {
  await db
    .update(whatsappMessages)
    .set({
      mediaError: reason.slice(0, 500),
      mediaAttempts: attempts ?? MAX_ATTEMPTS,
    })
    .where(sql`${whatsappMessages.id} = ${id}`);
}

/**
 * Whether it is worth trying this one inline, in the webhook itself.
 *
 * A photo is a few hundred kilobytes and arrives before the counsellor
 * has finished reading the message. A sixteen-megabyte video is not
 * worth holding a webhook open for — Meta retries a slow webhook, and a
 * retried webhook is a duplicated message.
 */
export function worthFetchingInline(mimeType: string | null, declaredSize?: number): boolean {
  if (declaredSize && declaredSize > INLINE_LIMIT_BYTES) return false;
  return (mimeType ?? "").startsWith("image/");
}

/**
 * The sweep: everything an inline attempt did not get.
 *
 * Oldest first, deliberately — Meta's thirty-day clock means the oldest
 * pending item is always the one closest to being lost for good.
 */
export async function downloadPendingMedia(limit = 25): Promise<{ fetched: number; failed: number }> {
  let fetched = 0;
  let failed = 0;

  try {
    const pending = await db
      .select({
        id: whatsappMessages.id,
        mediaId: whatsappMessages.mediaId,
        mediaMimeType: whatsappMessages.mediaMimeType,
        leadId: whatsappMessages.leadId,
        attempts: whatsappMessages.mediaAttempts,
      })
      .from(whatsappMessages)
      .where(
        and(
          isNotNull(whatsappMessages.mediaId),
          isNull(whatsappMessages.mediaStoragePath),
          lt(whatsappMessages.mediaAttempts, MAX_ATTEMPTS),
        ),
      )
      .orderBy(asc(whatsappMessages.occurredAt))
      .limit(limit);

    for (const message of pending) {
      const outcome = await downloadMessageMedia(message);
      if (outcome.ok) fetched += 1;
      else failed += 1;
    }
  } catch (error) {
    await captureError({ source: "whatsapp:inbound-media", error });
  }

  return { fetched, failed };
}
