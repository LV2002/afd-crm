import { afterEach, describe, expect, it, vi } from "vitest";

import { wabaIdsForToken } from "../src/lib/integrations/whatsapp/client";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(body: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 400, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("wabaIdsForToken", () => {
  it("reads the WhatsApp accounts the token was granted, once each", async () => {
    stubFetch({
      data: {
        granular_scopes: [
          { scope: "whatsapp_business_management", target_ids: ["111", "222"] },
          { scope: "whatsapp_business_messaging", target_ids: ["111"] },
          { scope: "business_management", target_ids: ["999"] },
        ],
      },
    });
    expect(await wabaIdsForToken("app", "secret", "tok")).toEqual(["111", "222"]);
  });

  it("asks Meta with the app's own access token, not the user's", async () => {
    const fn = stubFetch({ data: { granular_scopes: [] } });
    await wabaIdsForToken("app", "secret", "tok");
    const url = new URL(String(fn.mock.calls[0][0]));
    expect(url.searchParams.get("input_token")).toBe("tok");
    expect(url.searchParams.get("access_token")).toBe("app|secret");
  });

  it("returns nothing when the token has no WhatsApp scope", async () => {
    stubFetch({ data: {} });
    expect(await wabaIdsForToken("app", "secret", "tok")).toEqual([]);
  });

  it("throws on a refusal", async () => {
    stubFetch({ error: { message: "bad" } }, false);
    await expect(wabaIdsForToken("app", "secret", "tok")).rejects.toThrow(/reading the token/);
  });
});
