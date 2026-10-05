"use server";

import { gunzipSync } from "node:zlib";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { restoreArchive } from "@/lib/backup/import";
import { createClient } from "@/lib/supabase/server";

export interface RestoreState {
  error?: string;
  success?: string;
}

/**
 * Vercel refuses a request body over 4.5 MB, and a server action is a
 * request body like any other. Checked here so the message says what
 * happened and what to do, rather than the platform returning a bare 413
 * that looks like the CRM crashed.
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function restoreFromArchive(
  _prev: RestoreState,
  formData: FormData,
): Promise<RestoreState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You are not signed in." };
  // The mirror of the export's gate: restoring writes both configuration
  // and every lead and payment the file carries.
  if (!can(user, "config.import") || !can(user, "lead.import")) {
    return {
      error:
        "Restoring an archive needs permission to import both configuration and lead data, because it contains both.",
    };
  }

  const file = formData.get("archive");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an archive file first." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error: `This archive is ${(file.size / 1024 / 1024).toFixed(1)} MB, and an upload through the browser is capped at 4 MB by the hosting platform. Restore it with a database tool instead, or ask for the archive to be read from file storage — see docs/BACKUP.md.`,
    };
  }

  let contents: string;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    // Gzipped is what the download produces; a plain .ndjson is accepted
    // too, because somebody will unzip it to look inside and then try to
    // restore what they are holding.
    contents = isGzip(bytes) ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8");
  } catch {
    return {
      error:
        "This file could not be read. It should be the .ndjson.gz the download produced, exactly as it was downloaded.",
    };
  }

  const result = await restoreArchive(contents);
  if (!result.ok) return { error: result.error };

  await writeAuditLog(await createClient(), {
    actorId: user.id,
    action: "backup.restore",
    entityType: "archive",
    after: {
      archiveCreatedAt: result.header?.createdAt ?? null,
      organisation: result.header?.organisation ?? null,
      tables: result.counts?.length ?? 0,
      rows: result.total ?? 0,
    },
  });

  revalidatePath("/settings/backup");
  return {
    success: `Restored ${result.total?.toLocaleString("en-IN")} rows across ${result.counts?.length} tables, from the archive taken on ${result.header?.createdAt?.slice(0, 10)}. Sign-in accounts are not part of an archive — invite your staff again from Settings → Users before anybody can log in.`,
  };
}

/** gzip's two magic bytes. Cheaper and more honest than trusting the file name. */
function isGzip(bytes: Buffer): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}
