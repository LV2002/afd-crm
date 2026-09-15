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

const COUNSELLOR = checker({ "lead.read": "own" });
const CENTRE_HEAD = checker({
  "lead.read": "center",
  "lead.assign": "center",
  "payment.read": "center",
  "student.read": "center",
});
const ADMIN = checker({
  "lead.read": "all",
  "lead.assign": "all",
  "payment.read": "all",
  "student.read": "all",
  "settings.manage": "all",
});

describe("allowsWidget", () => {
  it("needs the permission the widget's data reads", () => {
    expect(allowsWidget(widgetByKey("accounts")!, COUNSELLOR)).toBe(false);
    expect(allowsWidget(widgetByKey("accounts")!, CENTRE_HEAD)).toBe(true);
  });

  it("honours a widget that only makes sense at one scope", () => {
    // "Your day" lists the leads assigned to you. A centre head holds
    // lead.read at centre scope and has nothing assigned to them, so the
    // card would be a believable row of zeroes.
    expect(allowsWidget(widgetByKey("my_day")!, COUNSELLOR)).toBe(true);
    expect(allowsWidget(widgetByKey("my_day")!, CENTRE_HEAD)).toBe(false);
    expect(allowsWidget(widgetByKey("my_day")!, ADMIN)).toBe(false);
  });
});

describe("resolveDashboard", () => {
  it("falls back to everything permitted, in registry order, when nothing is arranged", () => {
    expect(resolveDashboard([], COUNSELLOR).map((w) => w.key)).toEqual(["my_day"]);
    expect(resolveDashboard([], ADMIN).map((w) => w.key)).toEqual([
      "centre",
      "accounts",
      "academics",
      "admin",
    ]);
  });

  it("applies the arranged order", () => {
    const layout: LayoutRow[] = [
      { widgetKey: "admin", sortOrder: 0, isVisible: true },
      { widgetKey: "accounts", sortOrder: 1, isVisible: true },
      { widgetKey: "centre", sortOrder: 2, isVisible: true },
      { widgetKey: "academics", sortOrder: 3, isVisible: true },
    ];
    expect(resolveDashboard(layout, ADMIN).map((w) => w.key)).toEqual([
      "admin",
      "accounts",
      "centre",
      "academics",
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
      { widgetKey: "my_day", sortOrder: 2, isVisible: true },
    ];
    expect(resolveDashboard(layout, COUNSELLOR).map((w) => w.key)).toEqual(["my_day"]);
  });

  it("shows a widget added to the code after the last save, at the end", () => {
    // Only some widgets arranged: the rest keep their registry position
    // and stay visible, so shipping a widget does not require editing
    // every role's layout before anybody sees it.
    const layout: LayoutRow[] = [{ widgetKey: "admin", sortOrder: 0, isVisible: true }];
    const keys = resolveDashboard(layout, ADMIN).map((w) => w.key);
    expect(keys[0]).toBe("admin");
    expect(keys).toHaveLength(4);
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

describe("the widget registry", () => {
  it("has unique keys, since the database stores them as text", () => {
    const keys = DASHBOARD_WIDGETS.map((widget) => widget.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
