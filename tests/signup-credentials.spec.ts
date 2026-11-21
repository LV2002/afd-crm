import { describe, expect, it } from "vitest";

import { credentialsToSave } from "../src/lib/whatsapp/signup-credentials";

const incoming = { access_token: "new-token", waba_id: "222", phone_number_id: "333" };

describe("credentialsToSave", () => {
  it("fills in everything on a fresh install (the first number ever connected)", () => {
    const { toSave, keptExisting } = credentialsToSave({}, incoming);
    expect(toSave).toEqual(incoming);
    expect(keptExisting).toEqual([]);
  });
  it("leaves the institute's saved credentials alone when a second number is connected", () => {
    const { toSave, keptExisting } = credentialsToSave({ access_token: "old", waba_id: "111", phone_number_id: "999" }, incoming);
    expect(toSave).toEqual({});
    expect(keptExisting).toEqual(["access_token", "waba_id", "phone_number_id"]);
  });
  it("fills in only what is missing", () => {
    const { toSave } = credentialsToSave({ access_token: "old", phone_number_id: "999" }, incoming);
    expect(toSave).toEqual({ waba_id: "222" });
  });
});
