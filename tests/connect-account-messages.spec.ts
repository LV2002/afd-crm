import { beforeEach, describe, expect, it, vi } from "vitest";

import { MetaGraphApiError } from "../src/lib/integrations/meta/graph-client";

const meta = {
  numbers: vi.fn(),
  subscribe: vi.fn(),
  apps: vi.fn(),
};
let permitted = true;
let creds: Record<string, string | null> = { access_token: "tok", app_id: "111" };

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({ id: "u", permissions: {} }),
  can: () => permitted,
}));
vi.mock("@/lib/integrations/credentials", () => ({
  getIntegrationCredential: async (_p: string, k: string) => creds[k] ?? null,
  getIntegrationCredentials: async () => creds,
}));
vi.mock("@/lib/integrations/whatsapp/client", () => ({
  listWabaPhoneNumbers: (...a: unknown[]) => meta.numbers(...a),
  subscribeAppToWaba: (...a: unknown[]) => meta.subscribe(...a),
  fetchWabaSubscribedApps: (...a: unknown[]) => meta.apps(...a),
  wabaIdsForToken: async () => [],
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/audit/log", () => ({ writeAuditLog: async () => undefined }));
vi.mock("@/lib/db/client", () => ({ db: {} }));

const { connectAccountMessages } = await import("../src/app/(app)/settings/integrations/whatsapp/find-numbers-actions");

beforeEach(() => {
  permitted = true;
  creds = { access_token: "tok", app_id: "111" };
  meta.numbers.mockReset().mockResolvedValue([{ id: "9", displayPhoneNumber: "+91 98954 84652", verifiedName: "afdindia" }]);
  meta.subscribe.mockReset().mockResolvedValue(undefined);
  meta.apps.mockReset().mockResolvedValue(["111"]);
});

describe("connecting an account's messages", () => {
  it("subscribes, confirms with Meta, and names the numbers it can see", async () => {
    const r = await connectAccountMessages(" 827478374391335 ");
    expect(r.success).toMatch(/Meta confirms it/);
    expect(r.success).toContain("+91 98954 84652");
    expect(meta.subscribe).toHaveBeenCalledWith("827478374391335", "tok");
  });

  it("says so when the saved token cannot see the account, and does not subscribe", async () => {
    meta.numbers.mockRejectedValue(new MetaGraphApiError("Unsupported get request", 400, {}));
    const r = await connectAccountMessages("827478374391335");
    expect(r.error).toMatch(/cannot see account 827478374391335/);
    expect(r.error).toMatch(/new token/);
    expect(meta.subscribe).not.toHaveBeenCalled();
  });

  it("does not claim success when Meta still does not list the app afterwards", async () => {
    meta.apps.mockResolvedValue(["999"]);
    const r = await connectAccountMessages("827478374391335");
    expect(r.success).toBeUndefined();
    expect(r.error).toMatch(/still does not list this app/);
  });

  it("reports Meta's refusal in its own words", async () => {
    meta.subscribe.mockRejectedValue(new MetaGraphApiError("(#200) Permissions error", 403, {}));
    expect((await connectAccountMessages("827478374391335")).error).toMatch(/Permissions error/);
  });

  it("refuses anything that is not an account ID, and needs the saved credentials and permission", async () => {
    expect((await connectAccountMessages("abc")).error).toMatch(/digits only/);
    creds = { access_token: null, app_id: null };
    expect((await connectAccountMessages("827478374391335")).error).toMatch(/Save the access token/);
    permitted = false;
    expect((await connectAccountMessages("827478374391335")).error).toMatch(/permission/);
  });
});
