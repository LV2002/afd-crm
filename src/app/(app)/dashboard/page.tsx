import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";

import { AcademicsWidget } from "./academics-widget";
import { AccountsWidget } from "./accounts-widget";
import { AdminWidget } from "./admin-widget";
import { CentreWidget } from "./centre-widget";
import { MyDayWidget } from "./my-day-widget";

/**
 * Role-aware landing page: every widget is gated on the permission it
 * actually needs, never a role name (CLAUDE.md's dynamic-roles model) — a
 * center_head who also holds payment.read/student.read sees the Accounts
 * and Academics widgets too, which is correct: CLAUDE.md describes them as
 * running their centre end to end, not just its sales pipeline.
 *
 * "Your day" is gated on scope, not the bare permission: `lead.read` at
 * scope 'own' is the counsellor shape (works their own leads); at scope
 * 'center'/'all' (accounts, center_head, admin) it would only ever show
 * zero counts, since nothing gets assigned to those roles directly.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return <AccessDenied />;

  const showMyDay = scopeFor(user, "lead.read") === "own";
  const showCentre = can(user, "lead.assign");
  const showAccounts = can(user, "payment.read");
  const showAcademics = can(user, "student.read");
  const showAdmin = can(user, "settings.manage");

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
        {showMyDay && <MyDayWidget userId={user.id} />}
        {showCentre && <CentreWidget />}
        {showAccounts && <AccountsWidget />}
        {showAcademics && <AcademicsWidget />}
        {showAdmin && <AdminWidget />}
      </div>

      {!showMyDay && !showCentre && !showAccounts && !showAcademics && !showAdmin && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing to show here yet for your role.
        </p>
      )}
    </div>
  );
}
