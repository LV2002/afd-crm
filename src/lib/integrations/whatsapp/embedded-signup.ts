/**
 * Meta's Embedded Signup, decoded.
 *
 * The flow is a popup Meta hosts. It talks back to the page that opened
 * it with `window.postMessage`, and separately hands the Facebook SDK an
 * authorisation code. Neither half is much use alone: the message says
 * which WhatsApp Business Account and phone number were connected, the
 * code is what turns into a token. The button waits for both.
 *
 * This module is the parsing, kept away from the DOM so it can be tested.
 * Everything here is pure.
 *
 * ## The origin check is the security boundary
 *
 * `window.addEventListener("message")` receives from *any* window that
 * has a handle on ours. Meta's own documentation suggests
 * `event.origin.endsWith("facebook.com")`, which also accepts
 * `https://notfacebook.com` and `https://facebook.com.attacker.net` is
 * only a typo away. Since the payload decides which WhatsApp account this
 * institute's CRM connects itself to, it is an exact-match allowlist
 * here.
 */

/** Exactly these. Not a suffix test — see the note above. */
const TRUSTED_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://business.facebook.com",
  "https://m.facebook.com",
  "https://facebook.com",
]);

export function isTrustedSignupOrigin(origin: string): boolean {
  return TRUSTED_ORIGINS.has(origin);
}

export interface SignupFinished {
  status: "finished";
  wabaId: string;
  /**
   * Null on the "only WABA" finish, which happens when the account is
   * connected but no number was added in the same sitting. Still worth
   * reporting: the account half is done and the number can follow.
   */
  phoneNumberId: string | null;
}

export interface SignupCancelled {
  status: "cancelled";
  /** Which screen they backed out of, when Meta says. Useful in support. */
  step: string | null;
}

export interface SignupFailed {
  status: "failed";
  message: string;
}

export type SignupMessage = SignupFinished | SignupCancelled | SignupFailed;

/**
 * Every finish Meta uses for this flow.
 *
 * `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` is the Coexistence one — the
 * counsellor scanned the QR code on their own phone. The other two are
 * the ordinary paths, accepted because the same button serves both and a
 * flow that completed is a flow that completed.
 */
const FINISH_EVENTS = new Set([
  "FINISH",
  "FINISH_ONLY_WABA",
  "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Turns one `message` event's `data` into something meaningful, or null
 * if it is not ours.
 *
 * Null covers a great deal of ordinary traffic: React DevTools, browser
 * extensions and Meta's own SDK all post messages to this window, and
 * most are not even JSON. Anything unrecognised is ignored rather than
 * reported, because a listener that surfaces every stray message as an
 * error is a listener somebody turns off.
 *
 * The caller must have checked the origin first. This cannot — it is
 * handed the payload, not the event.
 */
export function parseSignupMessage(raw: unknown): SignupMessage | null {
  let payload: unknown = raw;

  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (typeof payload !== "object" || payload === null) return null;
  const message = payload as Record<string, unknown>;

  if (message.type !== "WA_EMBEDDED_SIGNUP") return null;

  const event = text(message.event);
  const data = (typeof message.data === "object" && message.data !== null
    ? message.data
    : {}) as Record<string, unknown>;

  if (event && FINISH_EVENTS.has(event)) {
    const wabaId = text(data.waba_id);
    // A finish with no account id is not a finish we can act on. Treated
    // as a failure rather than silently dropped: the person watched the
    // dialog say it was done, and silence afterwards is the worst answer.
    if (!wabaId) {
      return { status: "failed", message: "Meta reported the connection finished but did not say which WhatsApp Business Account it connected." };
    }
    return { status: "finished", wabaId, phoneNumberId: text(data.phone_number_id) };
  }

  if (event === "CANCEL") {
    return { status: "cancelled", step: text(data.current_step) };
  }

  if (event === "ERROR") {
    return {
      status: "failed",
      message: text(data.error_message) ?? "Meta reported an error but did not say what it was.",
    };
  }

  return null;
}

/**
 * What `FB.login` is called with.
 *
 * Built here rather than inline so the Coexistence feature type is stated
 * once, next to the note explaining it. `response_type: "code"` with
 * `override_default_response_type` is what makes Meta hand back an
 * authorisation code instead of a short-lived client token — the code is
 * exchanged on the server for a token that outlives the browser session,
 * which is the only kind worth storing.
 */
export function signupLoginOptions(configId: string): Record<string, unknown> {
  return {
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
      // The Coexistence path: connect a number already running in the
      // WhatsApp Business app, rather than registering a new one. Without
      // it the dialog offers "new number" and the counsellor loses their
      // chats, which is the one outcome this whole feature exists to
      // avoid.
      featureType: "whatsapp_business_app_onboarding",
      sessionInfoVersion: "3",
    },
  };
}
