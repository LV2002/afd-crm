/**
 * What a Meta token can actually do, said on screen.
 *
 * `debug_token` has always returned the permission list and `checkToken`
 * always threw it away, which is why "Instagram DMs arrive from staff and
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

  it("names the Instagram messaging permission when it is absent", () => {
    // The case this was built for.
    const granted = ALL_PAGE.filter((scope) => scope !== "instagram_manage_messages");
    const report = compareScopes(granted, PAGE_TOKEN_SCOPES);
    expect(report?.missing.map((entry) => entry.scope)).toEqual(["instagram_manage_messages"]);
    expect(describeMissingScopes(report)).toMatch(/Instagram DMs, in and out/);
    expect(describeMissingScopes(report)).toMatch(/instagram_manage_messages/);
  });

  it("leads with the consequence and keeps the permission name", () => {
    // `pages_messaging` means nothing to somebody running a coaching
    // institute; "Instagram DMs are delivered" does. The name still has
    // to appear, because it is what gets typed into Meta's request form.
    const report = compareScopes(["pages_show_list"], PAGE_TOKEN_SCOPES);
    const text = describeMissingScopes(report)!;
    expect(text.indexOf("Receiving Instagram DMs")).toBeLessThan(text.indexOf("pages_messaging"));
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
    // instagram_manage_messages. Checking both against one list would
    // report a fault on every correctly configured instance.
    const report = compareScopes(["ads_read"], ADS_TOKEN_SCOPES);
    expect(report?.missing.map((entry) => entry.scope)).toEqual(["ads_management"]);
    expect(ADS_TOKEN_SCOPES.map((entry) => entry.scope)).not.toContain("instagram_manage_messages");
  });

  it("covers every permission the Instagram and Lead Ads paths need", () => {
    // A permission missing from this list is one the CRM can never report
    // on, which is exactly the hole this closes.
    for (const scope of [
      "pages_messaging",
      "instagram_basic",
      "instagram_manage_messages",
      "leads_retrieval",
      "pages_manage_metadata",
    ]) {
      expect(ALL_PAGE).toContain(scope);
    }
  });
});
