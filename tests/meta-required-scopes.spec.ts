/**
 * What a Meta token can actually do, said on screen.
 *
 * `debug_token` has always returned the permission list and `checkToken`
 * always threw it away, which is why "leads arrive from staff and
 * nobody else" could only be diagnosed through Meta's own Permissions and
 * Features page — slow, sometimes blank, and gated behind business
 * verification.
 *
 * Pure logic.
 */
import { describe, expect, it } from "vitest";

import {
  ADS_TOKEN_SCOPES,
  PAGE_TOKEN_SCOPES,
  compareScopes,
  describeMissingScopes,
} from "../src/lib/integrations/meta/required-scopes";

const ALL_PAGE = PAGE_TOKEN_SCOPES.map((entry) => entry.scope);

describe("comparing a token's permissions against what the CRM needs", () => {
  it("reports nothing missing when everything is granted", () => {
    const report = compareScopes(ALL_PAGE, PAGE_TOKEN_SCOPES);
    expect(report?.missing).toEqual([]);
    expect(describeMissingScopes(report)).toBeNull();
  });

  it("names a missing permission together with what stops working", () => {
    const granted = ALL_PAGE.filter((scope) => scope !== "leads_retrieval");
    const report = compareScopes(granted, PAGE_TOKEN_SCOPES);
    expect(report?.missing.map((entry) => entry.scope)).toEqual(["leads_retrieval"]);
    expect(describeMissingScopes(report)).toMatch(/Lead Ads form/);
    expect(describeMissingScopes(report)).toMatch(/leads_retrieval/);
  });

  it("leads with the consequence and keeps the permission name", () => {
    // The permission name means nothing to somebody running a coaching
    // institute; what stops working does. The name still has to appear,
    // because it is what gets typed into Meta's request form.
    const report = compareScopes(["pages_show_list"], PAGE_TOKEN_SCOPES);
    const text = describeMissingScopes(report)!;
    expect(text.indexOf("Subscribing the Page")).toBeLessThan(text.indexOf("pages_manage_metadata"));
  });

  it("no longer asks for any Instagram or Messenger permission", () => {
    const names = PAGE_TOKEN_SCOPES.map((entry) => entry.scope);
    expect(names).not.toContain("instagram_manage_messages");
    expect(names).not.toContain("instagram_basic");
    expect(names).not.toContain("pages_messaging");
  });

  it("treats an empty permission list as unknown, not as nothing granted", () => {
    // A System User token can come back without the list. Reporting seven
    // missing permissions for a token that works sends somebody to fix
    // what is not broken.
    expect(compareScopes(undefined, PAGE_TOKEN_SCOPES)).toBeNull();
    expect(compareScopes([], PAGE_TOKEN_SCOPES)).toBeNull();
    expect(describeMissingScopes(null)).toBeNull();
  });

  it("holds the ads token to different permissions", () => {
    // A Page token never carries ads_read, and an ads token never carries
    // leads_retrieval. Checking both against one list would report a fault
    // on every correctly configured instance.
    const report = compareScopes(["ads_read"], ADS_TOKEN_SCOPES);
    expect(report?.missing.map((entry) => entry.scope)).toEqual(["ads_management"]);
    expect(ADS_TOKEN_SCOPES.map((entry) => entry.scope)).not.toContain("leads_retrieval");
  });

  it("covers every permission the Lead Ads path needs", () => {
    // A permission missing from this list is one the CRM can never report
    // on, which is exactly the hole this closes.
    for (const scope of [
      "leads_retrieval",
      "pages_manage_metadata",
    ]) {
      expect(ALL_PAGE).toContain(scope);
    }
  });
});
