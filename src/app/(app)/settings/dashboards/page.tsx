import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import type { PermissionCode } from "@/lib/auth/permissions";
import { getRoleLayout } from "@/lib/dashboard/get-layout";
import { allowsWidget } from "@/lib/dashboard/resolve-layout";
import { DASHBOARD_WIDGETS } from "@/lib/dashboard/widgets";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { LayoutEditor, type EditorWidget } from "./layout-editor";

export const dynamic = "force-dynamic";

/**
 * Settings → Dashboards.
 *
 * "Which registered widgets appear for which role" is on CLAUDE.md's
 * configurable list and was the last thing on it still decided in code.
 * The landing page is the screen every person in the institute opens
 * first and the one most worth tuning per department — the accounts team
 * does not need the pipeline card above their collections.
 *
 * The permissions shown here are the *role's*, not the reader's: an admin
 * arranging the counsellor dashboard has to see what a counsellor can
 * see, which is not what they themselves can.
 */
export default async function DashboardSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const { role: requestedRole } = await searchParams;
  const supabase = await createClient();

  const { data: roles } = await supabase
    .from("roles")
    .select("id, name, code")
    .order("name")
    .returns<Array<{ id: string; name: string; code: string }>>();

  const roleList = roles ?? [];
  const selected = roleList.find((role) => role.id === requestedRole) ?? roleList[0];

  if (!selected) {
    return <p className="text-sm text-muted-foreground">No roles yet.</p>;
  }

  const [{ data: grants }, layout] = await Promise.all([
    supabase
      .from("role_permissions")
      .select("permission_code, scope")
      .eq("role_id", selected.id)
      .returns<Array<{ permission_code: string; scope: "own" | "center" | "all" }>>(),
    getRoleLayout(supabase, selected.id),
  ]);

  const scopeByPermission = new Map((grants ?? []).map((g) => [g.permission_code, g.scope]));
  const check = {
    has: (permission: PermissionCode) => scopeByPermission.has(permission),
    scope: (permission: PermissionCode) => scopeByPermission.get(permission),
  };

  const arrangedByKey = new Map(layout.map((row) => [row.widgetKey, row]));

  // Saved order first, then anything the admin has never touched — a
  // widget added to the codebase after the last save appears at the end
  // rather than silently missing from the screen that is supposed to list
  // every one of them.
  const ordered = [...DASHBOARD_WIDGETS].sort((a, b) => {
    const orderA = arrangedByKey.get(a.key)?.sortOrder ?? DASHBOARD_WIDGETS.indexOf(a) + 100;
    const orderB = arrangedByKey.get(b.key)?.sortOrder ?? DASHBOARD_WIDGETS.indexOf(b) + 100;
    return orderA - orderB;
  });

  const widgets: EditorWidget[] = ordered.map((widget) => {
    const allowed = allowsWidget(widget, check);
    return {
      key: widget.key,
      name: widget.name,
      description: widget.description,
      allowed,
      blockedReason: allowed
        ? undefined
        : widget.requireScope && scopeByPermission.has(widget.permission)
          ? `${selected.name} holds ${widget.permission}, but across a whole centre rather than their own leads — this card would only ever show zero.`
          : `${selected.name} does not have ${widget.permission}, so this card would have nothing to count.`,
      visible: arrangedByKey.get(widget.key)?.isVisible ?? true,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboards</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          What each role sees when they sign in, and in what order. A widget can be switched off
          for a role, but never switched on for a role whose permissions would leave it empty.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {roleList.map((role) => (
          <Link
            key={role.id}
            href={`/settings/dashboards?role=${role.id}`}
            className={cn(
              "inline-flex min-h-9 items-center rounded-md border px-3 text-sm",
              role.id === selected.id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {role.name}
          </Link>
        ))}
      </nav>

      <LayoutEditor
        key={selected.id}
        roleId={selected.id}
        roleName={selected.name}
        widgets={widgets}
        arranged={layout.length > 0}
      />
    </div>
  );
}
