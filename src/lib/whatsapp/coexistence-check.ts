/**
 * The Coexistence health check, decided from facts already gathered.
 *
 * Each line says whether one thing that must be true for chats to flow IS
 * true, and what to do if not. Pure, so the reasoning is tested without
 * Meta in the way.
 */

export const BASE_FIELDS = ["messages"] as const;
/** The three fields only a Coexistence number uses. Messages sent from the phone and old history arrive on these. */
export const COEXISTENCE_FIELDS = ["smb_message_echoes", "history", "smb_app_state_sync"] as const;

export interface CheckInput {
  hasAppCredentials: boolean;
  hasVerifyToken: boolean;
  /** Null: the app has no WhatsApp webhook configured. Undefined: could not be read. */
  subscription: { callbackUrl: string | null; active: boolean; fields: string[] } | null | undefined;
  subscriptionError?: string;
  /** What this CRM's webhook address is, for comparing against what Meta has. */
  expectedCallback: string | null;
  /** Is the app subscribed to the WhatsApp Business Account? Undefined when it could not be checked. */
  wabaSubscribed: boolean | undefined;
  coexistenceNumbers: number;
  lastDeliveryAt: Date | null;
}

export type CheckStatus = "ok" | "problem" | "unknown";

export interface CheckLine {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** True when the CRM can fix this itself with the button. */
  fixable?: boolean;
}

export function missingFields(have: string[], needCoexistence: boolean): string[] {
  const need: string[] = [...BASE_FIELDS, ...(needCoexistence ? COEXISTENCE_FIELDS : [])];
  return need.filter((f) => !have.includes(f));
}

export function evaluateCoexistenceCheck(input: CheckInput, now = new Date()): CheckLine[] {
  const lines: CheckLine[] = [];

  if (!input.hasAppCredentials) {
    lines.push({
      id: "app",
      label: "App ID and App Secret saved",
      status: "problem",
      detail: "Save both above. The CRM needs them to read and set the app's webhook fields.",
    });
    return lines;
  }
  lines.push({ id: "app", label: "App ID and App Secret saved", status: "ok", detail: "Found." });

  if (input.subscription === undefined) {
    lines.push({ id: "webhook", label: "Meta's webhook for this app", status: "unknown", detail: input.subscriptionError ?? "Could not read it from Meta. Check the App ID and App Secret." });
  } else if (input.subscription === null) {
    lines.push({ id: "webhook", label: "Meta's webhook for this app", status: "problem", detail: "The app has no WhatsApp webhook set up, so Meta delivers nothing. The button below can create it.", fixable: input.hasVerifyToken });
  } else {
    const sameAddress = !input.expectedCallback || input.subscription.callbackUrl === input.expectedCallback;
    lines.push({
      id: "webhook",
      label: "Meta's webhook for this app",
      status: input.subscription.active && sameAddress ? "ok" : "problem",
      detail: sameAddress
        ? `Delivers to ${input.subscription.callbackUrl ?? "(no address)"}.`
        : `Delivers to ${input.subscription.callbackUrl ?? "(no address)"}, but this CRM is at ${input.expectedCallback}. Messages are going somewhere else. Fix it in Meta's app dashboard → WhatsApp → Configuration.`,
    });

    const missing = missingFields(input.subscription.fields, input.coexistenceNumbers > 0);
    lines.push({
      id: "fields",
      label: input.coexistenceNumbers > 0 ? "Webhook fields (including Coexistence)" : "Webhook fields",
      status: missing.length === 0 ? "ok" : "problem",
      detail:
        missing.length === 0
          ? `Subscribed: ${input.subscription.fields.join(", ")}.`
          : `Not ticked: ${missing.join(", ")}. ${missing.some((f) => f !== "messages") ? "Without these, messages sent from a counsellor's phone and old chat history never reach the CRM." : ""}`.trim(),
      fixable: missing.length > 0 && input.hasVerifyToken,
    });
  }

  lines.push(
    input.wabaSubscribed === undefined
      ? { id: "waba", label: "App subscribed to the WhatsApp Business Account", status: "unknown", detail: "Could not check (needs the saved access token and Business Account ID)." }
      : {
          id: "waba",
          label: "App subscribed to the WhatsApp Business Account",
          status: input.wabaSubscribed ? "ok" : "problem",
          detail: input.wabaSubscribed ? "Yes." : "No. Messages for this account are not sent to the app. Reconnect the number with Connect with Meta, or press Subscribe.",
        },
  );

  lines.push({
    id: "numbers",
    label: "Numbers registered as Coexistence in the CRM",
    status: input.coexistenceNumbers > 0 ? "ok" : "problem",
    detail: input.coexistenceNumbers > 0 ? `${input.coexistenceNumbers} registered.` : "None. A counsellor's number must be added below (Connect with Meta) before its chats can be filed.",
  });

  if (!input.lastDeliveryAt) {
    lines.push({ id: "delivery", label: "Last message received from Meta", status: "problem", detail: "Nothing has ever arrived. Send a message to the number from another phone, then run this check again." });
  } else {
    const hours = Math.floor((now.getTime() - input.lastDeliveryAt.getTime()) / 3_600_000);
    lines.push({ id: "delivery", label: "Last message received from Meta", status: "ok", detail: hours < 1 ? "Within the last hour." : `${hours} hour${hours === 1 ? "" : "s"} ago.` });
  }
  return lines;
}
