"use server";

import { revalidatePath } from "next/cache";

import { can, getCurrentUser } from "@/lib/auth/session";
import { composeEmail, emailConfigured, sendEmail } from "@/lib/email/send";
import { resolveAlertRecipients } from "@/lib/errors/alert-recipients";
import { resolveError } from "@/lib/errors/capture";

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
