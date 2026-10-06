/**
 * Parsing what Meta's Embedded Signup popup posts back.
 *
 * None of this can be tested against Meta until Advanced Access lands, so
 * the parsing is where the tests go — and it is the part that decides
 * which WhatsApp account this institute connects itself to, so it is the
 * part that most deserves them.
 */
import { describe, expect, it } from "vitest";

import {
  isTrustedSignupOrigin,
  parseSignupMessage,
  signupLoginOptions,
} from "../src/lib/integrations/whatsapp/embedded-signup";

describe("isTrustedSignupOrigin", () => {
  it("accepts the origins Meta actually posts from", () => {
    expect(isTrustedSignupOrigin("https://www.facebook.com")).toBe(true);
    expect(isTrustedSignupOrigin("https://web.facebook.com")).toBe(true);
    expect(isTrustedSignupOrigin("https://business.facebook.com")).toBe(true);
  });

  it("rejects the lookalikes a suffix test would wave through", () => {
    // Meta's own sample code is `origin.endsWith("facebook.com")`. Every
    // one of these passes that, and the payload decides which WhatsApp
    // account this CRM connects to.
    expect(isTrustedSignupOrigin("https://notfacebook.com")).toBe(false);
    expect(isTrustedSignupOrigin("https://evil-facebook.com")).toBe(false);
    expect(isTrustedSignupOrigin("https://facebook.com.attacker.net")).toBe(false);
  });

  it("rejects http, even on a real Meta host", () => {
    expect(isTrustedSignupOrigin("http://www.facebook.com")).toBe(false);
  });
});

describe("parseSignupMessage", () => {
  it("reads a Coexistence finish", () => {
    const result = parseSignupMessage(
      JSON.stringify({
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
        data: { waba_id: "1237871018535323", phone_number_id: "938468419357254" },
      }),
    );
    expect(result).toEqual({
      status: "finished",
      wabaId: "1237871018535323",
      phoneNumberId: "938468419357254",
    });
  });

  it("reads the ordinary finish too, since one button serves both paths", () => {
    const result = parseSignupMessage({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      data: { waba_id: "111", phone_number_id: "222" },
    });
    expect(result).toEqual({ status: "finished", wabaId: "111", phoneNumberId: "222" });
  });

  it("accepts an account connected without a number", () => {
    // FINISH_ONLY_WABA. Half the job is done and the number can follow;
    // refusing it would throw away a connection that really happened.
    const result = parseSignupMessage({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_ONLY_WABA",
      data: { waba_id: "111" },
    });
    expect(result).toEqual({ status: "finished", wabaId: "111", phoneNumberId: null });
  });

  it("treats a finish with no account id as a failure, not a success", () => {
    // The person watched the dialog say it was done. Silence afterwards
    // is the worst possible answer.
    const result = parseSignupMessage({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      data: { phone_number_id: "222" },
    });
    expect(result?.status).toBe("failed");
  });

  it("reads a cancel, and which screen they backed out of", () => {
    const result = parseSignupMessage({
      type: "WA_EMBEDDED_SIGNUP",
      event: "CANCEL",
      data: { current_step: "PHONE_NUMBER_SETUP" },
    });
    expect(result).toEqual({ status: "cancelled", step: "PHONE_NUMBER_SETUP" });
  });

  it("reads an error, and falls back when Meta does not say what went wrong", () => {
    expect(parseSignupMessage({ type: "WA_EMBEDDED_SIGNUP", event: "ERROR", data: { error_message: "Number already registered" } })).toEqual({
      status: "failed",
      message: "Number already registered",
    });
    const vague = parseSignupMessage({ type: "WA_EMBEDDED_SIGNUP", event: "ERROR", data: {} });
    expect(vague?.status).toBe("failed");
  });

  it("ignores everything that is not ours", () => {
    // React DevTools, browser extensions and Meta's own SDK all post to
    // this window. A listener that reported each one as a problem is a
    // listener somebody turns off.
    expect(parseSignupMessage("not json at all")).toBeNull();
    expect(parseSignupMessage(JSON.stringify({ type: "something-else" }))).toBeNull();
    expect(parseSignupMessage({ source: "react-devtools-bridge" })).toBeNull();
    expect(parseSignupMessage(null)).toBeNull();
    expect(parseSignupMessage(42)).toBeNull();
    expect(parseSignupMessage({ type: "WA_EMBEDDED_SIGNUP", event: "SOMETHING_NEW" })).toBeNull();
  });

  it("survives a payload with no data object", () => {
    expect(parseSignupMessage({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL" })).toEqual({
      status: "cancelled",
      step: null,
    });
  });
});

describe("signupLoginOptions", () => {
  it("asks for a code rather than a browser token", () => {
    // The code is exchanged server-side for a token that outlives the
    // session. The default response type is a client token that does not.
    const options = signupLoginOptions("cfg-123");
    expect(options.config_id).toBe("cfg-123");
    expect(options.response_type).toBe("code");
    expect(options.override_default_response_type).toBe(true);
  });

  it("asks for the Coexistence path", () => {
    // Without this the dialog offers "new number", and the counsellor
    // loses the chats this whole feature exists to keep.
    const extras = signupLoginOptions("cfg-123").extras as Record<string, unknown>;
    expect(extras.featureType).toBe("whatsapp_business_app_onboarding");
  });
});
