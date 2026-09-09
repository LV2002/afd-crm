import { and, asc, eq, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { centers, profiles, roles, targets, userCenters } from "@/lib/db/schema";

import { MonthPicker } from "./month-picker";
import { TargetRow, type TargetRowValues } from "./target-row";

export const dynamic = "force-dynamic";

/**
 * The numbers for the month.
 *
 * Three scopes, in the order an institute actually decides them: the
 * whole business first, then each centre, then the people in it. They are
 * separate rows and are never added together — see the targets table's
 * own comment for why that matters.
 *
 * Everything is per month and nothing is copied forward automatically. A
 * target that rolls over on its own is a target nobody re-thought, and by
 * March it is measuring the business against a January that no longer
 * exists.
 */

const MONTH = /^\d{4}-\d{2}$/;

function currentMonthIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export default async function TargetsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "target.manage")) return <AccessDenied />;

  const params = await searchParams;
  const raw = params.month;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const month = requested && MONTH.test(requested) ? requested : currentMonthIST();
  const periodMonth = `${month}-01`;

  const scope = scopeFor(user, "target.manage");
  const isOrgWide = scope === "all";

  const [existing, centerRows, staffRows] = await Promise.all([
    db
      .select({
        centerId: targets.centerId,
        ownerId: targets.ownerId,
        metric: targets.metric,
        targetValue: targets.targetValue,
      })
      .from(targets)
      .where(and(eq(targets.periodMonth, periodMonth), isNull(targets.deletedAt))),

    db
      .select({ id: centers.id, name: centers.name })
      .from(centers)
      .where(eq(centers.isActive, true))
      .orderBy(asc(centers.name)),

    db
      .selectDistinct({
        id: profiles.id,
        fullName: profiles.fullName,
        roleName: roles.name,
        centerId: userCenters.centerId,
      })
      .from(profiles)
      .innerJoin(roles, eq(roles.id, profiles.roleId))
      .leftJoin(userCenters, eq(userCenters.userId, profiles.id))
      .where(eq(profiles.isActive, true))
      .orderBy(asc(profiles.fullName)),
  ]);

  // A centre head sets numbers for their own centres and the people in
  // them, and sees nothing else on this screen. The RLS policies enforce
  // the same boundary; this is what keeps the page from offering rows
  // that would be refused on save.
  const visibleCenters = isOrgWide
    ? centerRows
    : centerRows.filter((center) => user.centerIds.includes(center.id));

  const staff = new Map<string, { id: string; fullName: string; roleName: string }>();
  for (const row of staffRows) {
    if (!isOrgWide && (!row.centerId || !user.centerIds.includes(row.centerId))) continue;
    if (!staff.has(row.id)) {
      staff.set(row.id, { id: row.id, fullName: row.fullName, roleName: row.roleName });
    }
  }

  function valuesFor(kind: "org" | "center" | "owner", id: string | null): TargetRowValues {
    const rows = existing.filter((row) =>
      kind === "org"
        ? row.centerId === null && row.ownerId === null
        : kind === "center"
          ? row.centerId === id
          : row.ownerId === id,
    );
    const find = (metric: string) => rows.find((row) => row.metric === metric)?.targetValue ?? null;
    const revenue = find("revenue");
    return {
      leads: find("leads") === null ? "" : String(find("leads")),
      admissions: find("admissions") === null ? "" : String(find("admissions")),
      // Rupees on screen, paise in the database.
      revenue: revenue === null ? "" : String(revenue / 100),
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Targets</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          What you are aiming for this month. Leave a box empty for &ldquo;no target&rdquo; — the
          reports then show the count without pretending to judge it. Nothing carries forward on
          its own: next month is a decision you make next month.
        </p>
      </div>

      <MonthPicker month={month} />

      <div className="flex flex-col gap-4">
        {isOrgWide && (
          <TargetRow
            month={month}
            kind="org"
            scopeId={null}
            label="Whole institute"
            hint="Every centre together. Not the sum of the rows below — its own number."
            values={valuesFor("org", null)}
          />
        )}

        {visibleCenters.map((center) => (
          <TargetRow
            key={center.id}
            month={month}
            kind="center"
            scopeId={center.id}
            label={center.name}
            hint="Centre"
            values={valuesFor("center", center.id)}
          />
        ))}

        {[...staff.values()].map((person) => (
          <TargetRow
            key={person.id}
            month={month}
            kind="owner"
            scopeId={person.id}
            label={person.fullName}
            hint={person.roleName}
            values={valuesFor("owner", person.id)}
          />
        ))}
      </div>
    </div>
  );
}
