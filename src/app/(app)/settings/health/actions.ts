"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { runDailyAndRecord } from "@/lib/cron/run-daily";
import { runFrequentAndRecord } from "@/lib/cron/run-frequent";
import { composeEmail, emailConfigured, sendEmail } from "@/lib/email/send";
import { resolveAlertRecipients } from "@/lib/errors/alert-recipients";
import { resolveError } from "@/lib/errors/capture";
import { createClient } from "@/lib/supabase/server";

export interface HealthState {
  error?: string;
  success?: string;
}

/**
 * Marks a problem fixed.
 *
 * Not a delete: the row stays, and the next time that same fault appears
 * it opens a FRESH row rather than quietly resuming the closed one's
 * count. A bug coming back is news, and the whole point of closing one is
 * to be told if it does.
 */
export async function markResolved(_prev: HealthState, formData: FormData): Promise<HealthState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const id = String(formData.get("errorId") ?? "").trim();
  if (!id) return { error: "Which problem?" };

  await resolveError(id, String(formData.get("note") ?? "").trim() || null);
  revalidatePath("/settings/health");
  return { success: "Marked fixed. You'll be told if it comes back." };
}

/**
 * Sends one email to the alert addresses, and says exactly what happened.
 *
 * ## Why this exists
 *
 * Switching email on means pasting two values into a hosting dashboard —
 * `RESEND_API_KEY` and `EMAIL_FROM` — and then having no idea whether it
 * worked. The screen could only say "configured", which means those two
 * variables are non-empty strings and nothing more: a revoked key, a
 * typo, an unverified sending domain and a sandbox that will only deliver
 * to one address all look identical from there. The honest check is to
 * send one and read the answer.
 *
 * The provider's own refusal is passed through verbatim rather than
 * tidied into "could not send". Resend names the actual rule — "You can
 * only send testing emails to your own email address", "domain is not
 * verified", "API key is invalid" — and each one has a different fix.
 * Replacing that with our own wording is the mistake this codebase keeps
 * finding in itself (docs/DECISIONS.md): a tool discarding what the
 * platform already said.
 */
export async function sendTestEmail(): Promise<HealthState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  if (!emailConfigured()) {
    // Which one is missing, not just "not configured". They are set in
    // two different fields of the same form and one of them is easy to
    // leave out.
    const missing = [
      process.env.RESEND_API_KEY ? null : "RESEND_API_KEY",
      process.env.EMAIL_FROM ? null : "EMAIL_FROM",
    ].filter(Boolean);
    return {
      error: `Email isn't switched on yet — ${missing.join(" and ")} ${
        missing.length > 1 ? "are" : "is"
      } not set on the deployment. Nothing was sent.`,
    };
  }

  const recipients = await resolveAlertRecipients();
  if (recipients.length === 0) {
    return {
      error:
        "There is nobody to send to. Put an address in Settings → Organisation → Send platform alerts to.",
    };
  }

  const { text, html } = composeEmail({
    heading: "Your CRM can send email.",
    lines: [
      "This is a test, sent because somebody pressed the button on Settings → Platform health.",
      "Nothing is wrong. From now on, a fault in the CRM reaches this inbox instead of waiting for somebody to open the screen.",
    ],
    actionLabel: "Open Platform health",
    actionPath: "/settings/health",
    footer: "Sent by the AFD India CRM.",
  });

  const result = await sendEmail({
    to: recipients,
    subject: "CRM test email — alerts are working",
    text,
    html,
  });

  if (!result.ok) {
    return {
      error: `The mail provider refused it: ${result.reason}`,
    };
  }

  return {
    success: `Sent to ${recipients.join(", ")}. If it hasn't arrived in a minute, check the spam folder — that is the other half of why a sending domain gets verified.`,
  };
}

/**
 * Runs the nightly jobs now, from the screen that reports on them.
 *
 * ## Why an admin can do this at all
 *
 * The nightly run happens once a day at 10:00 IST. Everything that depends
 * on a credential — ad spend, retargeting, WhatsApp automations — therefore
 * had a debugging loop of twenty-four hours per attempt: paste a token,
 * wait a day, find out it was the wrong kind of token, paste another.
 * Nobody debugs anything that way, which is why the Meta spend sat broken
 * for a week without anyone being able to say which of three causes it was.
 *
 * ## The secret, and why pressing this proves something either way
 *
 * The sub-routes each check `CRON_SECRET` from the `authorization` header,
 * so this mints a request carrying it. That makes the button a direct test
 * of the single most common cause of "nothing ran": if the deployment has
 * no `CRON_SECRET`, the schedule's calls are turned away with a 401 and
 * nothing is recorded anywhere, and pressing this says so in one sentence
 * instead of pointing at a hosting dashboard.
 *
 * ## What it is not
 *
 * Not a dry run. These are the real jobs: queued broadcasts go out, fee
 * reminders are sent, audiences are updated. The button confirms before
 * running for that reason.
 */
export async function runNightlyNow(): Promise<HealthState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      error:
        "CRON_SECRET is not set on this deployment — which is also why nothing runs overnight. Set it in the hosting environment and redeploy; the schedule and this button both start working at once.",
    };
  }

  const result = await runDailyAndRecord(
    new Request("https://cron.local/api/cron/daily", {
      headers: { authorization: `Bearer ${secret}` },
    }),
  );

  await writeAuditLog(await createClient(), {
    actorId: user.id,
    action: "cron.manual_run",
    entityType: "cron_runs",
    // `summary.ok` is a count of jobs, `result.ok` is whether the run
    // passed. Spreading one over the other silently kept the wrong one.
    after: {
      runPassed: result.ok,
      okCount: result.summary.ok,
      failedCount: result.summary.failed,
      skippedCount: result.summary.skipped,
    },
  });

  revalidatePath("/settings/health");

  const { ok: ran, failed, skipped } = result.summary;
  const parts = [`${ran} ran`];
  if (failed > 0) parts.push(`${failed} failed`);
  if (skipped > 0) parts.push(`${skipped} skipped for want of time`);

  return result.ok
    ? { success: `Done in ${Math.round(result.durationMs / 1000)}s — ${parts.join(", ")}. The panel below now shows what each job did.` }
    : {
        error: `${parts.join(", ")}. The panel below names which, and why.`,
      };
}


/**
 * The frequent run, on demand.
 *
 * Separate from the nightly button because the two answer different
 * questions. This one is what somebody presses when a broadcast has not
 * gone out and they want it gone out *now* — and because it is the
 * fastest way to prove an external scheduler would work before setting
 * one up.
 */
export async function runFrequentNow(): Promise<HealthState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      error:
        "CRON_SECRET is not set on this deployment, so nothing scheduled can run at all — an outside scheduler calling the URL would be turned away the same way. Set it in the hosting environment and redeploy.",
    };
  }

  const result = await runFrequentAndRecord(
    new Request("https://cron.local/api/cron/frequent", {
      headers: { authorization: `Bearer ${secret}` },
    }),
  );

  await writeAuditLog(await createClient(), {
    actorId: user.id,
    action: "cron.manual_run",
    entityType: "cron_runs",
    after: {
      jobKey: "frequent",
      runPassed: result.ok,
      okCount: result.summary.ok,
      failedCount: result.summary.failed,
      skippedCount: result.summary.skipped,
    },
  });

  revalidatePath("/settings/health");

  const { ok: ran, failed } = result.summary;
  return result.ok
    ? {
        success: `Done in ${Math.round(result.durationMs / 1000)}s — ${ran} ran. Any automation step or broadcast that was due has gone out.`,
      }
    : { error: `${ran} ran, ${failed} failed. The panel below names which, and why.` };
}
