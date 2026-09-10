import "server-only";

/**
 * Sending email.
 *
 * There was none. Notifications existed only inside the application, so a
 * counsellor who did not open the CRM never learned they had an overdue
 * lead or a breached response target — and when something broke in
 * production, nobody found out until a person happened to notice.
 *
 * ## Why an HTTP call rather than a library
 *
 * Resend's whole API is one POST. Adding an SDK for that would be a
 * dependency, a bundle and a version to keep current in exchange for
 * nothing. `fetch` is already here.
 *
 * ## Why environment variables rather than the credentials table
 *
 * Every other integration in this codebase stores its keys encrypted in
 * `integration_credentials`, and for Meta and Google that is right — they
 * are business settings an admin changes. This one is different in a way
 * that matters: it is the channel that tells somebody the DATABASE is
 * down. A mail client that has to read the database first cannot report
 * the failure it exists to report.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface EmailMessage {
  to: string | string[];
  subject: string;
  /** Plain text. Always sent — some people read mail in clients that never render HTML. */
  text: string;
  /** Optional richer version. */
  html?: string;
  replyTo?: string;
}

export type EmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: string; configured: boolean };

/** Whether mail can be sent at all. Screens use this to say so rather than failing quietly. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * The addresses that get told when the platform itself breaks.
 *
 * Comma-separated, because it is a handful of people and a table would be
 * one more thing that has to be readable at the moment the database is
 * the problem.
 */
export function alertRecipients(): string[] {
  return (process.env.ALERT_EMAIL_TO ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

/**
 * Sends one email.
 *
 * Never throws. Every caller is doing something else that matters more —
 * recording a payment, processing a webhook, reporting an error — and an
 * unreachable mail provider must not take that down with it. The result
 * says what happened for callers that want to record it.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return { ok: false, reason: "Email isn't configured.", configured: false };
  }

  const to = Array.isArray(message.to) ? message.to : [message.to];
  if (to.length === 0) return { ok: false, reason: "No recipients.", configured: true };

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      // A mail provider having a bad day must not hold a request open. The
      // notification is worth less than the page that was sending it.
      signal: AbortSignal.timeout(8000),
    });

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        body && typeof body === "object" && "message" in body
          ? String((body as { message: unknown }).message)
          : `HTTP ${response.status}`;
      return { ok: false, reason: detail, configured: true };
    }

    const id =
      body && typeof body === "object" && "id" in body ? String((body as { id: unknown }).id) : "";
    return { ok: true, id };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Could not reach the mail provider.",
      configured: true,
    };
  }
}

/**
 * The application's own URL, for links in emails.
 *
 * An alert saying "a payment failed" with no way to go and look at it is
 * half an alert.
 */
export function appUrl(path = ""): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!base) return path;
  return `${base.replace(/\/$/, "")}${path}`;
}

/**
 * One plain-text house style for every email this system sends.
 *
 * Deliberately plain text rather than a designed template. These are
 * operational messages read on a phone between other things — a subject
 * line that says what happened and three lines that say what to do beats
 * anything with a header image, and it cannot render wrong.
 */
export interface EmailBrand {
  name: string;
  primaryColor: string;
}

export function composeEmail(input: {
  heading: string;
  lines: string[];
  actionLabel?: string;
  actionPath?: string;
  footer?: string;
  /**
   * The institute's name and colour, when the caller can safely read them.
   *
   * Optional on purpose. The error alerter calls this from inside a
   * failure and must not touch the database to do it — the whole point of
   * that path is to work when the database is what is broken — so it
   * sends the plain version. Everything else passes the brand and the
   * recipient sees who the message is from.
   */
  brand?: EmailBrand;
}): { text: string; html: string } {
  const link = input.actionPath ? appUrl(input.actionPath) : null;

  const accent = input.brand?.primaryColor ?? "#2f4fd0";

  const text = [
    ...(input.brand ? [input.brand.name, ""] : []),
    input.heading,
    "",
    ...input.lines,
    ...(link ? ["", `${input.actionLabel ?? "Open"}: ${link}`] : []),
    ...(input.footer ? ["", "—", input.footer] : []),
  ].join("\n");

  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#16202b;max-width:34rem">
${input.brand ? `<p style="font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${accent};margin:0 0 14px">${escape(input.brand.name)}</p>` : ""}
<p style="font-size:17px;font-weight:600;margin:0 0 12px">${escape(input.heading)}</p>
${input.lines.map((line) => `<p style="margin:0 0 10px">${escape(line)}</p>`).join("\n")}
${link ? `<p style="margin:20px 0"><a href="${link}" style="background:${accent};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escape(input.actionLabel ?? "Open")}</a></p>` : ""}
${input.footer ? `<p style="margin:24px 0 0;color:#6b7684;font-size:13px;border-top:1px solid #e2e7ec;padding-top:12px">${escape(input.footer)}</p>` : ""}
</div>`;

  return { text, html };
}
