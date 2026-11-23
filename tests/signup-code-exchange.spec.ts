import { afterEach, describe, expect, it, vi } from "vitest";

import { exchangeSignupCodeWithFallbacks, isRedirectUriMismatch, RedirectExchangeError } from "../src/lib/integrations/whatsapp/client";
import { MetaGraphApiError } from "../src/lib/integrations/meta/graph-client";

afterEach(() => vi.unstubAllGlobals());

const mismatch = { error: { message: "Error validating verification code. Please make sure your redirect_uri is identical", code: 100, error_subcode: 36008 } };
const expired = { error: { message: "This authorization code has expired.", code: 100, error_subcode: 36007 } };
const ok = { access_token: "tok" };

function stub(responses: Array<{ ok: boolean; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce({ ok: r.ok, status: r.ok ? 200 : 400, json: async () => r.body });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const sentRedirect = (fn: ReturnType<typeof vi.fn>, n: number) => new URL(String(fn.mock.calls[n][0])).searchParams.get("redirect_uri");
const hasRedirect = (fn: ReturnType<typeof vi.fn>, n: number) => new URL(String(fn.mock.calls[n][0])).searchParams.has("redirect_uri");

describe("isRedirectUriMismatch", () => {
  it("recognises Meta's 36008 and nothing else", () => {
    expect(isRedirectUriMismatch(new MetaGraphApiError("x", 400, mismatch))).toBe(true);
    expect(isRedirectUriMismatch(new MetaGraphApiError("x", 400, expired))).toBe(false);
    expect(isRedirectUriMismatch(new Error("nope"))).toBe(false);
  });
});

describe("exchangeSignupCodeWithFallbacks", () => {
  it("works first time with no redirect_uri, as before", async () => {
    const fn = stub([{ ok: true, body: ok }]);
    const result = await exchangeSignupCodeWithFallbacks("app", "secret", "code");
    expect(result).toEqual({ accessToken: "tok", redirectForm: "none" });
    expect(hasRedirect(fn, 0)).toBe(false);
  });

  it("moves on to an empty redirect_uri, then the page address, only on a 36008", async () => {
    const fn = stub([{ ok: false, body: mismatch }, { ok: false, body: mismatch }, { ok: true, body: ok }]);
    const result = await exchangeSignupCodeWithFallbacks("app", "secret", "code", ["https://crm.example/settings/integrations/whatsapp"]);
    expect(result.redirectForm).toBe("https://crm.example/settings/integrations/whatsapp");
    expect(sentRedirect(fn, 1)).toBe("");
    expect(hasRedirect(fn, 1)).toBe(true);
    expect(sentRedirect(fn, 2)).toBe("https://crm.example/settings/integrations/whatsapp");
  });

  it("stops at once on any other refusal (the real answer), without trying more forms", async () => {
    const fn = stub([{ ok: false, body: expired }]);
    await expect(exchangeSignupCodeWithFallbacks("app", "secret", "code", ["https://crm.example/"])).rejects.toThrow(/exchanging/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("tries every form when all are refused, and reports what Meta said to each", async () => {
    const domain = { error: { message: "Can't load URL", code: 191 } };
    const fn = stub([{ ok: false, body: mismatch }, { ok: false, body: mismatch }, { ok: false, body: domain }, { ok: false, body: domain }]);
    const error = await exchangeSignupCodeWithFallbacks("app", "secret", "code", ["https://crm.example/settings"]).catch((e) => e);
    expect(error).toBeInstanceOf(RedirectExchangeError);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(error.outcomes).toEqual([
      "none → code 100/36008",
      "empty → code 100/36008",
      "https://crm.example/settings → code 191",
      "https://www.facebook.com/connect/login_success.html → code 191",
    ]);
  });

  it("continues past a code 191 (that form's domain not allowed) to the next form", async () => {
    const fn = stub([{ ok: false, body: mismatch }, { ok: false, body: mismatch }, { ok: false, body: { error: { code: 191, message: "x" } } }, { ok: true, body: ok }]);
    const result = await exchangeSignupCodeWithFallbacks("app", "secret", "code", ["https://crm.example/a"]);
    expect(result.redirectForm).toBe("https://www.facebook.com/connect/login_success.html");
    expect(fn).toHaveBeenCalledTimes(4);
  });
});

import { isAppDomainError } from "../src/lib/integrations/whatsapp/client";

describe("isAppDomainError", () => {
  it("recognises Meta's code 191 (domain not in the app's domains), whatever language it is worded in", () => {
    expect(isAppDomainError(new MetaGraphApiError("x", 400, { error: { message: "URL लोड करू शकत नाही", code: 191 } }))).toBe(true);
    expect(isAppDomainError(new MetaGraphApiError("x", 400, mismatch))).toBe(false);
    expect(isAppDomainError(new Error("nope"))).toBe(false);
  });
});
