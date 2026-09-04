import { asc, eq } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { discountLimits, roles } from "@/lib/db/schema";

import { LimitRow } from "./limit-row";

/**
 * How much each role may take off a fee without asking anyone.
 *
 * One row per role rather than a fixed list, because roles are database
 * rows (CLAUDE.md § Roles): a role created next year appears here the day
 * it is created, with no authority until somebody gives it some.
 *
 * A role with no row set has NO authority — every discount its holders
 * enter waits for approval. That is deliberate and the screen says so,
 * because the alternative failure (a role nobody configured being able to
 * give anything away) is the one this whole feature exists to prevent.
 */
export const dynamic = "force-dynamic";

function paiseToInput(paise: number | null): string {
  if (paise === null) return "";
  return String(paise / 100);
}

export default async function DiscountLimitsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const rows = await db
    .select({
      roleId: roles.id,
      roleName: roles.name,
      roleDescription: roles.description,
      maxPercent: discountLimits.maxPercent,
      maxAmountPaise: discountLimits.maxAmountPaise,
      isUnlimited: discountLimits.isUnlimited,
    })
    .from(roles)
    // Left join: a role with no limit yet must still appear, or it would
    // be invisible AND unable to give any discount, which looks like a bug.
    .leftJoin(discountLimits, eq(discountLimits.roleId, roles.id))
    .orderBy(asc(roles.name));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Discount Authority</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          How much each role can take off a fee on their own. Anything larger is recorded as a
          request and is <strong>not applied</strong> — the student owes the full fee until
          somebody with the authority approves it, which is what stops an unapproved discount
          quietly becoming permanent.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <LimitRow
            key={row.roleId}
            roleId={row.roleId}
            roleName={row.roleName}
            roleDescription={row.roleDescription}
            maxPercent={row.maxPercent === null ? "" : String(row.maxPercent)}
            maxAmount={paiseToInput(row.maxAmountPaise)}
            isUnlimited={row.isUnlimited ?? false}
          />
        ))}
      </div>

      <p className="max-w-2xl text-xs text-muted-foreground">
        Approving takes the <code className="font-mono">discount.approve</code> permission{" "}
        <em>and</em> enough authority to have given the discount in the first place — otherwise
        two people on the same ceiling could approve each other&apos;s requests and the limit
        would mean nothing. Anything nobody else can settle goes to an admin.
      </p>
    </div>
  );
}
