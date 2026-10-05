import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { archiveFileName, archiveStream } from "@/lib/backup/export";
import { reportingFailures } from "@/lib/errors/capture";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The year-end archive, as a download.
 *
 * ## A route handler, not a server action
 *
 * Server actions return values through the React payload, which means
 * the whole archive would be built in memory and handed back as one
 * string. This streams: the response starts as soon as the first table
 * is read, and peak memory is a page of rows no matter how large the
 * institute's history has grown.
 *
 * `/api/*` is outside the auth middleware's matcher — deliberately, so
 * that cron and webhook calls are not redirected to the login page — so
 * this route does its own check rather than inheriting one.
 *
 * ## Why two permissions
 *
 * An archive is every lead's phone number and every payment ever taken,
 * alongside the configuration. `config.export` alone is about
 * configuration and would quietly widen into a full data export;
 * `lead.export` alone would not cover the configuration. Requiring both
 * keeps each primitive meaning what it says, which is the point of
 * having named primitives at all (CLAUDE.md § Roles and permissions).
 */
async function run(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!can(user, "config.export") || !can(user, "lead.export")) {
    return NextResponse.json(
      {
        error:
          "Taking an archive needs permission to export both configuration and lead data, because it contains both.",
      },
      { status: 403 },
    );
  }

  const fileName = archiveFileName();

  // Written before the bytes leave, not after: CLAUDE.md § Non-negotiables
  // 5 — "every export writes to audit_log" — and an export that fails
  // half way still left the building with whatever it had sent.
  await writeAuditLog(await createClient(), {
    actorId: user.id,
    action: "backup.export",
    entityType: "archive",
    after: { fileName },
  });

  return new Response(archiveStream(), {
    headers: {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${fileName}"`,
      // Nothing about an archive should sit in a proxy or a browser cache.
      "cache-control": "no-store, no-transform",
    },
  });
}

export async function GET() {
  return reportingFailures("backup:export", run);
}
