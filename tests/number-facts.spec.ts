import { describe, expect, it } from "vitest";

import { callbackUrisIn, describeNumberFacts, pointsAtThisApp } from "../src/lib/whatsapp/number-facts";

const ok = (value: unknown) => ({ ok: true as const, value });
const ours = "https://afd-crm-one.vercel.app/api/webhooks/whatsapp";
const healthy = { status: ok("CONNECTED"), platform_type: ok("CLOUD_API"), is_on_biz_app: ok(true), webhook_configuration: ok({}), quality_rating: ok("GREEN") };

describe("what Meta says about a counsellor number", () => {
  it("is all clear for a connected Coexistence number with no override", () => {
    const lines = describeNumberFacts("Simi", healthy, ours);
    expect(lines.filter((l) => l.verdict === "bad")).toHaveLength(0);
    expect(lines.map((l) => l.text).join(" ")).toMatch(/No separate webhook address/);
  });

  it("flags a number that is not attached to the Cloud API", () => {
    const lines = describeNumberFacts("Simi", { ...healthy, platform_type: ok("NOT_APPLICABLE") }, ours);
    expect(lines.some((l) => l.verdict === "bad" && /NOT attached to the Cloud API/.test(l.text))).toBe(true);
  });

  it("flags a number Meta does not see in the Business app", () => {
    const lines = describeNumberFacts("Simi", { ...healthy, is_on_biz_app: ok(false) }, ours);
    expect(lines.some((l) => l.verdict === "bad" && /not Coexistence/.test(l.text))).toBe(true);
  });

  it("flags a status other than CONNECTED", () => {
    expect(describeNumberFacts("Simi", { ...healthy, status: ok("PENDING") }, ours).some((l) => l.verdict === "bad" && /PENDING/.test(l.text))).toBe(true);
  });

  it("finds a webhook override sending the messages elsewhere", () => {
    const facts = { ...healthy, webhook_configuration: ok({ phone_number: "https://old-provider.example.com/hook" }) };
    const bad = describeNumberFacts("Simi", facts, ours).find((l) => l.verdict === "bad");
    expect(bad?.text).toContain("https://old-provider.example.com/hook");
  });

  it("accepts an override that points at this CRM", () => {
    const facts = { ...healthy, webhook_configuration: ok({ application: ours }) };
    expect(describeNumberFacts("Simi", facts, ours).filter((l) => l.verdict === "bad")).toHaveLength(0);
  });

  it("says which fields Meta would not answer, and still reports the rest", () => {
    const lines = describeNumberFacts("Simi", { ...healthy, is_on_biz_app: { ok: false, error: "(#100) nonexisting field" } }, ours);
    expect(lines.some((l) => /is_on_biz_app/.test(l.text) && /nonexisting field/.test(l.text))).toBe(true);
    expect(lines.some((l) => l.verdict === "good")).toBe(true);
  });

  it("reads callback addresses wherever they are nested", () => {
    expect(callbackUrisIn({ a: { b: "https://x.example/h" }, c: "nope", d: ["x"] })).toEqual(["https://x.example/h"]);
    expect(callbackUrisIn(null)).toEqual([]);
    expect(pointsAtThisApp("https://afd-crm-one.vercel.app/other", ours)).toBe(true);
    expect(pointsAtThisApp("https://elsewhere.example/hook", ours)).toBe(false);
  });
});
