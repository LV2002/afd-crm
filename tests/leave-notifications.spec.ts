import { describe, expect, it } from "vitest";

import { notificationEvent } from "../src/lib/notifications/events";
import { resolveRecipients } from "../src/lib/notifications/recipients";

describe("who hears about a leave or comp day request", () => {
  for (const key of ["leave.requested", "comp.requested"] as const) {
    it(`${key} goes to the manager and to HR, co-admins and admins`, () => {
      const event = notificationEvent(key);
      expect(event.defaultNotifyOwner).toBe(true);
      expect([...event.defaultNotifyRoleCodes].sort()).toEqual(["admin", "co_admin", "hr"]);
    });
  }

  it("tells the manager and the overseers but never the person asking, even if they are an admin", () => {
    const candidates = [
      { userId: "co", roleId: "r-co", centerIds: [], seesAllCenters: true },
      { userId: "admin", roleId: "r-admin", centerIds: [], seesAllCenters: true },
      { userId: "applicant-admin", roleId: "r-admin", centerIds: [], seesAllCenters: true },
    ];
    const told = resolveRecipients({
      rules: { notifyRoles: ["r-co", "r-admin"], notifyOwner: true },
      candidates,
      ownerId: "manager",
      actorId: "applicant-admin",
      centerId: "kochi",
    });
    expect(told.sort()).toEqual(["admin", "co", "manager"]);
  });

  it("tells the money alert's audience: accounts and admin by default", () => {
    expect([...notificationEvent("finance.threshold").defaultNotifyRoleCodes].sort()).toEqual(["accounts", "admin"]);
  });
});
