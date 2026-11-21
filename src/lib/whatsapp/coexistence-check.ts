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
  /** What Meta has actually delivered, by kind, over the last 30 days. */
  activity: DeliveryActivity;
}

export interface KindActivity {
  count: number;
  last: Date | null;
}

export interface DeliveryActivity {
  /** A student's message arrived. */
  messages: KindActivity;
  /** Something the counsellor sent from their own phone. */
  echoes: KindActivity;
  /** The backfill of past chats. */
  history: KindActivity;
  /** Delivery receipts (sent / delivered / read) — proof the pipe is open, but not a message. */
  statuses: KindActivity;
  /** Deliveries for a phone number id the CRM does not know, with Meta's own words about it. */
  unregistered: Array<{ detail: string; at: Date }>;
  /** Student messages filed on each registered Coexistence number, so the totals above cannot hide which number they came to. */
  perNumber: Array<{ label: string; inbound: KindActivity }>;
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

  const ago = (d: Date | null) => {
    if (!d) return "never";
    const hours = Math.floor((now.getTime() - d.getTime()) / 3_600_000);
    return hours < 1 ? "within the last hour" : hours < 48 ? `${hours} hour${hours === 1 ? "" : "s"} ago` : `${Math.floor(hours / 24)} days ago`;
  };
  const a2 = input.activity;

  // The line that finally separates "Meta isn't sending" from "the CRM isn't
  // filing it": receipts alone prove only that the pipe is open.
  lines.push(
    a2.messages.count > 0
      ? { id: "msgs", label: "Messages from students received (30 days)", status: "ok", detail: `${a2.messages.count}, the latest ${ago(a2.messages.last)}.` }
      : {
          id: "msgs",
          label: "Messages from students received (30 days)",
          status: "problem",
          detail:
            a2.statuses.count > 0
              ? `None. Delivery receipts do arrive (${ago(a2.statuses.last)}) so the connection works, but no student message has reached the CRM. Send a message to the counsellor's number from another phone and run the check again.`
              : "None, and no delivery receipts either: Meta is sending nothing to this CRM. Send a message to the number from another phone and run the check again.",
        },
  );

  if (input.coexistenceNumbers > 0) {
    for (const n of a2.perNumber) {
      lines.push(
        n.inbound.count > 0
          ? { id: `num:${n.label}`, label: `Student messages on ${n.label} (30 days)`, status: "ok", detail: `${n.inbound.count}, the latest ${ago(n.inbound.last)}.` }
          : {
              id: `num:${n.label}`,
              label: `Student messages on ${n.label} (30 days)`,
              status: "problem",
              detail:
                a2.messages.count > 0
                  ? "None filed on this number. The messages counted above arrived on another number (probably the institute's API number), so this number is not delivering to the CRM yet."
                  : "None filed on this number.",
            },
      );
    }
    lines.push(
      a2.echoes.count > 0
        ? { id: "echoes", label: "Messages sent from the counsellor's phone (30 days)", status: "ok", detail: `${a2.echoes.count}, the latest ${ago(a2.echoes.last)}.` }
        : {
            id: "echoes",
            label: "Messages sent from the counsellor's phone (30 days)",
            status: "problem",
            detail: "None. Ask the counsellor to send a message to a student from the WhatsApp Business app on their phone, then run the check again. If it still never arrives, the number is probably not actually in Coexistence mode (the Business app on the phone must stay logged in to it).",
          },
      a2.history.count > 0
        ? { id: "history", label: "Old chat history", status: "ok", detail: `${a2.history.count} batch${a2.history.count === 1 ? "" : "es"} received, the latest ${ago(a2.history.last)}.` }
        : { id: "history", label: "Old chat history", status: "unknown", detail: "No history has arrived. It is only sent if the counsellor chose to share it when connecting, and only once. If they declined, the number must be disconnected and connected again." },
    );
  }

  if (a2.unregistered.length > 0) {
    lines.push({
      id: "unregistered",
      label: "Deliveries for a number the CRM does not know",
      status: "problem",
      detail: `${a2.unregistered.map((u) => u.detail).slice(0, 2).join(" ")} The Phone Number ID registered here does not match the one Meta is sending for.`,
    });
  }
  return lines;
}
