import { describe, expect, it } from "vitest";

import { allowsWidget, resolveDashboard, type LayoutRow } from "@/lib/dashboard/resolve-layout";
import { DASHBOARD_WIDGETS, widgetByKey } from "@/lib/dashboard/widgets";

type Scope = "own" | "center" | "all";

function checker(grants: Record<string, Scope>) {
  return {
    has: (permission: string) => permission in grants,
    scope: (permission: string) => grants[permission],
  } as Parameters<typeof resolveDashboard>[1];
}

const COUNSELLOR = checker({ "lead.read": "own", "report.read": "own" });
const CENTRE_HEAD = checker({
  "lead.read": "center",
  "lead.assign": "center",
  "report.center": "center",
  "payment.read": "center",
  "student.read": "center",
});
const ADMIN = checker({
  "lead.read": "all",
  "lead.assign": "all",
  "report.center": "all",
  "payment.read": "all",
  "student.read": "all",
  "settings.manage": "all",
});

describe("allowsWidget", () => {
  it("needs the permission the widget's data reads", () => {
    expect(allowsWidget(widgetByKey("accounts")!, COUNSELLOR)).toBe(false);
    expect(allowsWidget(widgetByKey("accounts")!, CENTRE_HEAD)).toBe(true);
  });

  it("lets everybody with lead.read see the quick links, at any scope", () => {
    // Your day used to hold this slot and was scope-restricted to `own`
    // until it turned out centre heads carry leads too. Quick links has
    // no scope rule at all: the links are the same wherever you sit, and
    // an admin who does not want them is handled by their seeded layout
    // (migration 0095), not by a rule here.
    expect(allowsWidget(widgetByKey("quick_links")!, COUNSELLOR)).toBe(true);
    expect(allowsWidget(widgetByKey("quick_links")!, CENTRE_HEAD)).toBe(true);
    expect(allowsWidget(widgetByKey("quick_links")!, ADMIN)).toBe(true);
  });

  it("keeps the team table away from a counsellor", () => {
    // One person's numbers shown to another person is a reporting act, so
    // it is gated on report.center — which a counsellor holds only at
    // `own`, and therefore not at all for this purpose.
    expect(allowsWidget(widgetByKey("centre_team")!, COUNSELLOR)).toBe(false);
    expect(allowsWidget(widgetByKey("centre_team")!, CENTRE_HEAD)).toBe(true);
  });

  it("still enforces requireScope for a widget that asks for it", () => {
    // No shipped widget uses it now, but the mechanism is load-bearing for
    // the next one that does, so it stays covered.
    const ownOnly = {
      key: "hypothetical",
      name: "Own only",
      description: "",
      permission: "lead.read" as const,
      requireScope: "own" as const,
    };
    expect(allowsWidget(ownOnly, COUNSELLOR)).toBe(true);
    expect(allowsWidget(ownOnly, CENTRE_HEAD)).toBe(false);
  });
});

describe("resolveDashboard", () => {
  it("falls back to everything permitted, in registry order, when nothing is arranged", () => {
    expect(resolveDashboard([], COUNSELLOR).map((w) => w.key)).toEqual([
      "my_numbers",
      "quick_links",
    ]);
    expect(resolveDashboard([], ADMIN).map((w) => w.key)).toEqual([
      "my_numbers",
      "quick_links",
      "centre",
      "centre_team",
      "accounts",
      "academics",
      "admin",
    ]);
  });

  it("applies the arranged order", () => {
    // Every widget arranged, which is what Settings → Dashboards saves: it
    // writes a row per widget rather than only the ones that moved.
    const layout: LayoutRow[] = [
      { widgetKey: "admin", sortOrder: 0, isVisible: true },
      { widgetKey: "accounts", sortOrder: 1, isVisible: true },
      { widgetKey: "centre", sortOrder: 2, isVisible: true },
      { widgetKey: "academics", sortOrder: 3, isVisible: true },
      { widgetKey: "centre_team", sortOrder: 4, isVisible: true },
      { widgetKey: "my_numbers", sortOrder: 5, isVisible: true },
      { widgetKey: "quick_links", sortOrder: 6, isVisible: true },
    ];
    expect(resolveDashboard(layout, ADMIN).map((w) => w.key)).toEqual([
      "admin",
      "accounts",
      "centre",
      "academics",
      "centre_team",
      "my_numbers",
      "quick_links",
    ]);
  });

  it("hides what the admin switched off", () => {
    const layout: LayoutRow[] = [
      { widgetKey: "centre", sortOrder: 0, isVisible: false },
      { widgetKey: "accounts", sortOrder: 1, isVisible: true },
    ];
    expect(resolveDashboard(layout, ADMIN).map((w) => w.key)).not.toContain("centre");
    expect(resolveDashboard(layout, ADMIN).map((w) => w.key)).toContain("accounts");
  });

  it("cannot grant a widget the role has no permission for", () => {
    // The floor. A layout row saying "show the accounts card to
    // counsellors" must not produce a card of zeroes.
    const layout: LayoutRow[] = [
      { widgetKey: "accounts", sortOrder: 0, isVisible: true },
      { widgetKey: "admin", sortOrder: 1, isVisible: true },
      { widgetKey: "quick_links", sortOrder: 2, isVisible: true },
      { widgetKey: "centre_team", sortOrder: 3, isVisible: true },
    ];
    expect(resolveDashboard(layout, COUNSELLOR).map((w) => w.key)).toEqual([
      "my_numbers",
      "quick_links",
    ]);
  });

  it("shows a widget added to the code after the last save", () => {
    // Only one widget arranged, deliberately pushed past every registry
    // index: the unarranged rest keep their registry position and stay
    // visible, so shipping a widget does not require editing every role's
    // layout before anybody sees it.
    const layout: LayoutRow[] = [{ widgetKey: "admin", sortOrder: 100, isVisible: true }];
    const keys = resolveDashboard(layout, ADMIN).map((w) => w.key);

    expect(keys).toHaveLength(DASHBOARD_WIDGETS.length);
    expect(keys.at(-1)).toBe("admin");
    // The two shipped since that layout was saved are present, in registry
    // order, without anybody having touched the arrangement.
    expect(keys.slice(0, 2)).toEqual(["my_numbers", "quick_links"]);
  });

  it("ignores a saved key the code no longer has", () => {
    const layout: LayoutRow[] = [
      { widgetKey: "retired_widget", sortOrder: 0, isVisible: true },
      { widgetKey: "admin", sortOrder: 1, isVisible: true },
    ];
    expect(resolveDashboard(layout, ADMIN).map((w) => w.key)).toContain("admin");
  });

  it("can leave a role with nothing, if that is what was asked for", () => {
    const layout: LayoutRow[] = DASHBOARD_WIDGETS.map((widget, index) => ({
      widgetKey: widget.key,
      sortOrder: index,
      isVisible: false,
    }));
    expect(resolveDashboard(layout, ADMIN)).toEqual([]);
  });
});

describe("the seeded admin default", () => {
  it("leaves an admin exactly what they had before the personal widgets existed", () => {
    // Leon: "admin portal is good as it is right now." Migration 0071 and
    // the seed both insert these two hiding rows, so adding the personal
    // cards to the registry does not change what an admin opens on.
    const layout: LayoutRow[] = [
      { widgetKey: "my_numbers", sortOrder: 0, isVisible: false },
      { widgetKey: "quick_links", sortOrder: 1, isVisible: false },
    ];
    expect(resolveDashboard(layout, ADMIN).map((w) => w.key)).toEqual([
      "centre",
      "centre_team",
      "accounts",
      "academics",
      "admin",
    ]);
  });

  it("does not hide them from a centre head, who does carry leads", () => {
    expect(resolveDashboard([], CENTRE_HEAD).map((w) => w.key)).toEqual([
      "my_numbers",
      "quick_links",
      "centre",
      "centre_team",
      "accounts",
      "academics",
    ]);
  });
});

describe("the widget registry", () => {
  it("has unique keys, since the database stores them as text", () => {
    const keys = DASHBOARD_WIDGETS.map((widget) => widget.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
