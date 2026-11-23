import { describe, expect, it } from "vitest";

import { signupEventName } from "../src/lib/integrations/whatsapp/embedded-signup";
import { pickNewNumber } from "../src/lib/whatsapp/pick-new-number";

const num = (id: string) => ({ id, displayPhoneNumber: `+91 ${id}` });

describe("pickNewNumber", () => {
  it("takes the one number the CRM does not already know", () => {
    const { chosen } = pickNewNumber([num("1"), num("2"), num("3")], ["1", "2"]);
    expect(chosen?.id).toBe("3");
  });
  it("never offers the institute's API number or an already registered one", () => {
    const { chosen, candidates } = pickNewNumber([num("api"), num("coex")], ["api", "coex"]);
    expect(chosen).toBeNull();
    expect(candidates).toEqual([]);
  });
  it("will not guess between several unregistered numbers", () => {
    const { chosen, candidates } = pickNewNumber([num("a"), num("b")], [null, undefined]);
    expect(chosen).toBeNull();
    expect(candidates).toHaveLength(2);
  });
});

describe("signupEventName", () => {
  it("reads the event of any Embedded Signup message, as an object or a JSON string", () => {
    expect(signupEventName({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" })).toBe("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
    expect(signupEventName(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL" }))).toBe("CANCEL");
  });
  it("ignores everything else", () => {
    expect(signupEventName({ type: "something-else" })).toBeNull();
    expect(signupEventName("not json")).toBeNull();
    expect(signupEventName(null)).toBeNull();
  });
});
