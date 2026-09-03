/**
 * Notifications: who hears what, in what words, and how often.
 *
 * The SLA escalation ladder had been configurable and completely inert
 * since Phase 2 — an admin could set "at 48 hours, tell the centre head"
 * and nothing whatsoever happened. These tests cover the three pieces of
 * real logic that make it work, all pure, none needing a database:
 *
 *  - who a notification reaches, and who it must NOT reach
 *  - the copy an admin writes, rendered
 *  - which ladder rungs are due, so a breach is escalated once rather
 *    than every hour until somebody notices
 */
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_EVENTS,
  isNotificationEventKey,
  notificationEvent,
} from "../src/lib/notifications/events";
import { renderTemplate, templateVariables, unknownVariables } from "../src/lib/notifications/render";
import { resolveRecipients, type RecipientCandidate } from "../src/lib/notifications/recipients";
import { dueEscalations, parseEscalationStep, policyEscalationSteps } from "../src/lib/sla/escalations";

const KOCHI = "center-kochi";
const KANNUR = "center-kannur";
const COUNSELLOR_ROLE = "role-counsellor";
const HEAD_ROLE = "role-center-head";
const ADMIN_ROLE = "role-admin";

function candidate(overrides: Partial<RecipientCandidate> & { userId: string }): RecipientCandidate {
  return {
    roleId: COUNSELLOR_ROLE,
    centerIds: [KOCHI],
    seesAllCenters: false,
    ...overrides,
  };
}

describe("resolveRecipients", () => {
  it("notifies the holders of the configured roles", () => {
    const recipients = resolveRecipients({
      rules: { notifyRoles: [HEAD_ROLE], notifyOwner: false },
      candidates: [
        candidate({ userId: "head", roleId: HEAD_ROLE }),
        candidate({ userId: "counsellor", roleId: COUNSELLOR_ROLE }),
      ],
      centerId: KOCHI,
    });

    expect(recipients).toEqual(["head"]);
  });

  it("never tells a centre head about another centre's lead", () => {
    // The copy carries a student's name. This is the rule that keeps a
    // notification from doing what the RLS policies exist to prevent.
    const recipients = resolveRecipients({
      rules: { notifyRoles: [HEAD_ROLE], notifyOwner: false },
      candidates: [
        candidate({ userId: "kochi-head", roleId: HEAD_ROLE, centerIds: [KOCHI] }),
        candidate({ userId: "kannur-head", roleId: HEAD_ROLE, centerIds: [KANNUR] }),
      ],
      centerId: KOCHI,
    });

    expect(recipients).toEqual(["kochi-head"]);
  });

  it("lets an org-wide reader hear about every centre", () => {
    const recipients = resolveRecipients({
      rules: { notifyRoles: [ADMIN_ROLE], notifyOwner: false },
      candidates: [
        candidate({ userId: "admin", roleId: ADMIN_ROLE, centerIds: [], seesAllCenters: true }),
      ],
      centerId: KANNUR,
    });

    expect(recipients).toEqual(["admin"]);
  });

  it("notifies a person assigned to several centres about any of them", () => {
    const recipients = resolveRecipients({
      rules: { notifyRoles: [HEAD_ROLE], notifyOwner: false },
      candidates: [
        candidate({ userId: "both", roleId: HEAD_ROLE, centerIds: [KOCHI, KANNUR] }),
      ],
      centerId: KANNUR,
    });

    expect(recipients).toEqual(["both"]);
  });

  it("filters nobody when the subject has no centre", () => {
    const recipients = resolveRecipients({
      rules: { notifyRoles: [HEAD_ROLE], notifyOwner: false },
      candidates: [candidate({ userId: "head", roleId: HEAD_ROLE, centerIds: [KANNUR] })],
      centerId: null,
    });

    expect(recipients).toEqual(["head"]);
  });

  it("adds the owner regardless of centre", () => {
    // It is their lead. A lead assigned across centres is a data problem
    // to fix, not a reason to leave its owner uninformed.
    const recipients = resolveRecipients({
      rules: { notifyRoles: [], notifyOwner: true },
      candidates: [],
      ownerId: "owner",
      centerId: KANNUR,
    });

    expect(recipients).toEqual(["owner"]);
  });

  it("does not add the owner when the setting is off", () => {
    const recipients = resolveRecipients({
      rules: { notifyRoles: [], notifyOwner: false },
      candidates: [],
      ownerId: "owner",
    });

    expect(recipients).toEqual([]);
  });

  it("never tells someone about their own action", () => {
    // "You confirmed this admission" is not news.
    const recipients = resolveRecipients({
      rules: { notifyRoles: [HEAD_ROLE], notifyOwner: true },
      candidates: [candidate({ userId: "head", roleId: HEAD_ROLE })],
      ownerId: "head",
      actorId: "head",
      centerId: KOCHI,
    });

    expect(recipients).toEqual([]);
  });

  it("sends one notification to someone who qualifies twice", () => {
    const recipients = resolveRecipients({
      rules: { notifyRoles: [COUNSELLOR_ROLE], notifyOwner: true },
      candidates: [candidate({ userId: "owner", roleId: COUNSELLOR_ROLE })],
      ownerId: "owner",
      centerId: KOCHI,
    });

    expect(recipients).toEqual(["owner"]);
  });
});

describe("renderTemplate", () => {
  it("substitutes what the event supplied", () => {
    expect(
      renderTemplate("Lead #{{lead_number}} from {{source}} is yours.", {
        lead_number: 42,
        source: "Meta",
      }),
    ).toBe("Lead #42 from Meta is yours.");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("Hi {{ name }}", { name: "Athira" })).toBe("Hi Athira");
  });

  it("renders a missing value as an em dash rather than leaving the braces", () => {
    // A counsellor seeing "—" reads it as missing data. Seeing
    // "{{course}}" reads as the software being broken.
    expect(renderTemplate("Course: {{course}}", {})).toBe("Course: —");
    expect(renderTemplate("Course: {{course}}", { course: null })).toBe("Course: —");
    expect(renderTemplate("Course: {{course}}", { course: "" })).toBe("Course: —");
  });

  it("has no expression language to exploit", () => {
    // The copy is configuration written in a settings box, not code.
    expect(renderTemplate("{{a.b}} {{a['b']}} {{ 1+1 }}", { a: "x" })).toBe(
      "{{a.b}} {{a['b']}} {{ 1+1 }}",
    );
  });

  it("lists the variables a template uses, once each, in order", () => {
    expect(templateVariables("{{b}} then {{a}} then {{b}}")).toEqual(["b", "a"]);
  });

  it("flags variables the event does not supply", () => {
    expect(unknownVariables("{{lead_name}} {{invoice_id}}", ["lead_name"])).toEqual(["invoice_id"]);
  });
});

describe("the event catalogue", () => {
  it("ships copy that only uses variables the event supplies", () => {
    // A shipped default rendering as "—" would be our bug, not an
    // admin's typo.
    for (const event of NOTIFICATION_EVENTS) {
      expect(
        unknownVariables(event.defaultTitle, event.variables),
        `${event.key} title`,
      ).toEqual([]);
      expect(unknownVariables(event.defaultBody, event.variables), `${event.key} body`).toEqual([]);
    }
  });

  it("has no duplicate keys", () => {
    const keys = NOTIFICATION_EVENTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("reaches somebody by default", () => {
    // An event that ships notifying nobody is the inert switch this
    // feature was built to remove.
    for (const event of NOTIFICATION_EVENTS) {
      const reachesSomeone =
        event.defaultNotifyOwner || event.defaultNotifyRoleCodes.length > 0;
      expect(reachesSomeone, `${event.key} notifies nobody by default`).toBe(true);
    }
  });

  it("recognises its own keys and rejects others", () => {
    expect(isNotificationEventKey("lead.assigned")).toBe(true);
    expect(isNotificationEventKey("lead.exploded")).toBe(false);
    expect(() => notificationEvent("lead.exploded" as never)).toThrow(/Unknown notification event/);
  });
});

describe("SLA escalation ladder", () => {
  const ladder = policyEscalationSteps([
    { at_hours: 24, notify_roles: ["role-a"] },
    { at_hours: 48, notify_roles: ["role-b"], notify_owner: true },
    { at_hours: 72, unassign: true },
  ]);

  it("reads the rungs in order", () => {
    expect(ladder.map((s) => s.atHours)).toEqual([24, 48, 72]);
    expect(ladder[1].notifyOwner).toBe(true);
    expect(ladder[2].unassign).toBe(true);
  });

  it("skips a rung it cannot read rather than throwing mid-sweep", () => {
    // Hand-edited JSON configuration. A cron halfway through a sweep must
    // not die because one rung has a typo in it.
    expect(parseEscalationStep({ notify_roles: [] })).toBeNull();
    expect(parseEscalationStep({ at_hours: "soon" })).toBeNull();
    expect(parseEscalationStep({ at_hours: -1 })).toBeNull();
    expect(parseEscalationStep(null)).toBeNull();
    expect(policyEscalationSteps("not an array")).toEqual([]);
  });

  it("fires nothing before the first rung comes due", () => {
    expect(dueEscalations(ladder, 12, null)).toEqual([]);
  });

  it("fires a rung once, not on every sweep", () => {
    // The whole point. An hourly cron re-notifying the same centre head
    // about the same lead teaches people to ignore notifications.
    const [first] = dueEscalations(ladder, 30, null);
    expect(first.atHours).toBe(24);
    expect(dueEscalations(ladder, 30, 24)).toEqual([]);
    expect(dueEscalations(ladder, 47, 24)).toEqual([]);
  });

  it("sends only the highest rung when several come due at once", () => {
    // A lead untouched over a weekend crosses 24, 48 and 72 together.
    // Three messages about one lead say nothing the last one doesn't.
    const due = dueEscalations(ladder, 80, null);
    expect(due).toHaveLength(1);
    expect(due[0].atHours).toBe(72);
  });

  it("climbs one rung at a time as the sweep runs", () => {
    expect(dueEscalations(ladder, 50, 24).map((s) => s.atHours)).toEqual([48]);
    expect(dueEscalations(ladder, 75, 48).map((s) => s.atHours)).toEqual([72]);
    expect(dueEscalations(ladder, 200, 72)).toEqual([]);
  });

  it("re-climbs from the bottom after the record is cleared", () => {
    // A rescued lead that goes bad again deserves the ladder again, which
    // is why the sweep nulls sla_escalated_at_hours when the SLA clears.
    expect(dueEscalations(ladder, 30, null).map((s) => s.atHours)).toEqual([24]);
  });

  it("treats a rung at zero hours as a real rung", () => {
    // `alreadyFiredUpTo` starts at null, and a naive `?? 0` floor would
    // swallow an "escalate immediately" rung entirely.
    const immediate = policyEscalationSteps([{ at_hours: 0, notify_roles: ["role-a"] }]);
    expect(dueEscalations(immediate, 0.5, null).map((s) => s.atHours)).toEqual([0]);
    expect(dueEscalations(immediate, 0.5, 0)).toEqual([]);
  });
});
