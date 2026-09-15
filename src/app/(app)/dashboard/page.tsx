import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { getRoleLayout } from "@/lib/dashboard/get-layout";
import { resolveDashboard } from "@/lib/dashboard/resolve-layout";
import { createClient } from "@/lib/supabase/server";

import { AcademicsWidget } from "./academics-widget";
import { AccountsWidget } from "./accounts-widget";
import { AdminWidget } from "./admin-widget";
import { CentreWidget } from "./centre-widget";
import { MyDayWidget } from "./my-day-widget";

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
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return <AccessDenied />;

  const supabase = await createClient();
  const layout = await getRoleLayout(supabase, user.roleId);

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

      <div className="grid gap-6 lg:grid-cols-2">
        {widgets.map((widget) => {
          switch (widget.key) {
            case "my_day":
              return <MyDayWidget key={widget.key} userId={user.id} />;
            case "centre":
              return <CentreWidget key={widget.key} />;
            case "accounts":
              return <AccountsWidget key={widget.key} />;
            case "academics":
              return <AcademicsWidget key={widget.key} />;
            case "admin":
              return <AdminWidget key={widget.key} />;
            default:
              // A key in the database that the code no longer has. Ignored
              // rather than crashed on, so removing a widget cannot break
              // a saved layout.
              return null;
          }
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
