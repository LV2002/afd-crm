import "server-only";

import { db } from "@/lib/db/client";
import { orgSettings } from "@/lib/db/schema";
import { alertRecipients as envRecipients } from "@/lib/email/send";

/**
 * Who hears about a platform failure.
 *
 * Settings → Organisation first, the `ALERT_EMAIL_TO` environment
 * variable second.
 *
 * ## Why not leave it in the environment
 *
 * Because changing who finds out that leads have stopped arriving should
 * not require a hosting dashboard. That is the exact test CLAUDE.md §10
 * sets for configuration, and the one setting whose entire purpose is
 * making sure a person is told was the one that needed a deploy.
 *
 * ## The objection, and why it does not hold here
 *
 * `alertRecipients()` carries a comment arguing that a table is "one
 * more thing that has to be readable at the moment the database is the
 * problem". True in general, and not true of this caller:
 * `captureError()` has already inserted the error row by the time it
 * asks who to tell, so the database has just demonstrated that it works.
 * A failure this function cannot read through is one that produced no
 * error row to alert about either.
 *
 * The environment variable stays anyway, as the path that needs no
 * database at all, and because an installation that already set it must
 * not go quiet the day it upgrades.
 */
export async function resolveAlertRecipients(): Promise<string[]> {
  const fromEnv = envRecipients();

  try {
    const [settings] = await db
      .select({ alertEmailTo: orgSettings.alertEmailTo })
      .from(orgSettings)
      .limit(1);

    const configured = (settings?.alertEmailTo ?? "")
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean);

    // Both, de-duplicated, rather than one overriding the other. Somebody
    // who set the environment variable months ago and types a second
    // address into Settings means "also tell this person", not "stop
    // telling the first one" — and a silently dropped alert recipient is
    // precisely the failure this whole feature exists to prevent.
    return [...new Set([...configured, ...fromEnv])];
  } catch {
    // Never throws: this is called from inside the thing that already
    // went wrong.
    return fromEnv;
  }
}
