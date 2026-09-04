import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

import { FinanceNav } from "./finance-nav";

/**
 * One gate for the whole section.
 *
 * Every finance page sits behind `finance.read`, checked once here rather
 * than repeated in a dozen files where one could be forgotten. RLS is
 * still the real boundary — the policies return nothing to a counsellor
 * whatever the routing does — but a person who cannot use this section
 * should be told so at the door rather than shown a set of empty tables.
 */
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.read")) return <AccessDenied />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Finance</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every rupee in one ledger — fees, other income, expenses and transfers between your own
          accounts. Nothing here is ever edited or deleted: a mistake is corrected by posting its
          mirror image, so the totals fix themselves and the trail stays intact.
        </p>
      </div>

      <FinanceNav
        canRecord={can(user, "finance.record")}
        canManage={can(user, "finance.manage")}
      />

      {children}

      <p className="text-xs text-muted-foreground">
        Only centre heads, accounts and admins can see this section.{" "}
        <Link href="/settings/roles" className="underline">
          Roles &amp; Permissions
        </Link>{" "}
        is where that is decided.
      </p>
    </div>
  );
}
