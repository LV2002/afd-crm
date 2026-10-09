import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser, scopeFor, type SessionUser } from "@/lib/auth/session";
import { getRoleLayout } from "@/lib/dashboard/get-layout";
import { resolveDashboard } from "@/lib/dashboard/resolve-layout";
import { createClient } from "@/lib/supabase/server";
import { getTerminologyMap } from "@/lib/terminology/get-terminology";
import type { TerminologyMap } from "@/lib/terminology/terms";

import { AcademicsWidget } from "./academics-widget";
import { AccountsWidget } from "./accounts-widget";
import { AdminWidget } from "./admin-widget";
import { CentreWidget } from "./centre-widget";
import { MyNumbersWidget } from "./my-numbers-widget";
import { QuickLinksWidget } from "./quick-links-widget";
import { TeamWidget } from "./team-widget";

/** The six-column grid, by the width a widget asked the registry for. */
const WIDTH_CLASS: Record<"narrow" | "half" | "wide" | "full", string> = {
  narrow: "lg:col-span-2",
  half: "lg:col-span-3",
  wide: "lg:col-span-4",
  full: "lg:col-span-6",
};


/**
 * The landing page, composed rather than hardcoded.
 *
 * It used to be five `can(...)` checks in a fixed order — correct as far
 * as it went (never a role name; always the permission the widget's data
 * actually needs) but not something an admin could change. Now the order
 * and the visibility come from `dashboard_layouts`, arranged per role in
 * Settings → Dashboards.
 *
 * The permission checks did not go away; they moved into the resolver as
 * a floor. An admin can hide a widget from a role but cannot grant one:
 * every widget reads through the RLS-bound client, so a widget shown
 * without its permission would draw a card of zeroes, and a believable
 * zero is worse than an absent card.
 *
 * A role nobody has arranged gets exactly what this page did before —
 * every widget it is allowed, in registry order.
 *
 * This is also where My Day went. It used to be a separate screen and a
 * four-number summary card here, which meant a counsellor checked two
 * places to start their morning and neither one told them how the month was
 * going. Now the queue is drawn in full on this page, `/my-day` redirects
 * here, and "Your numbers" sits above it. The widgets stay separate rows in
 * the registry rather than one merged card so an admin can still turn either
 * half off per role.
 */
function renderWidget(key: string, user: SessionUser, terms: TerminologyMap) {
  switch (key) {
    case "my_numbers":
      return <MyNumbersWidget userId={user.id} />;
    case "quick_links":
      return <QuickLinksWidget user={user} terms={terms} />;
    case "centre":
      return <CentreWidget />;
    case "centre_team":
      return <TeamWidget />;
    case "accounts":
      return <AccountsWidget />;
    case "academics":
      return <AcademicsWidget />;
    case "admin":
      return <AdminWidget />;
    default:
      return null;
  }
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return <AccessDenied />;

  const supabase = await createClient();
  // The counsellors a manager can open live in the sidebar, under Dashboard
  // — see components/layout/counsellor-links.tsx — not on this page.
  const [layout, terms] = await Promise.all([
    getRoleLayout(supabase, user.roleId),
    getTerminologyMap(),
  ]);

  const widgets = resolveDashboard(layout, {
    has: (permission) => can(user, permission),
    scope: (permission) => scopeFor(user, permission),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {user.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.roleName}
          {user.centerIds.length ? ` · ${user.centerIds.length} centre(s)` : ""}.
        </p>
      </div>

      {/*
        Six columns rather than two, so a pair can be uneven: the
        counsellor's numbers take four and Quick links two. A `half`
        widget is still three, so every layout that existed before this
        is laid out exactly as it was.
      */}
      <div className="grid gap-6 lg:grid-cols-6">
        {widgets.map((widget) => {
          const card = renderWidget(widget.key, user, terms);
          // A key in the database that the code no longer has. Ignored
          // rather than crashed on, so removing a widget cannot break a
          // saved layout.
          if (!card) return null;

          /*
            The span lives on the wrapper, not inside the widget.

            Each widget renders a Card and knows nothing about the grid it
            lands in — which is the right split, and the reason a widget
            cannot simply give itself `lg:col-span-2`: the class would be
            on the Card, one level below the grid item, and do nothing.
            The registry says how wide a widget wants to be and this is
            the one place that honours it.

            `min-w-0` is the same load-bearing class as the one on the
            main column in the app layout, for the same reason: a grid
            item's default `min-width: auto` means it refuses to shrink
            below its content, so the counsellor table inside one widget
            pushed the whole dashboard 196px past the phone and its own
            `overflow-x-auto` never engaged. Measured by the phone suite,
            which is the only thing that can see it.
          */
          return (
            <div key={widget.key} className={`min-w-0 ${WIDTH_CLASS[widget.width ?? "half"]}`}>
              {card}
            </div>
          );
        })}
      </div>

      {widgets.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing to show here yet for your role.
        </p>
      )}
    </div>
  );
}
