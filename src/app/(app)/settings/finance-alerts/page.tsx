import { asc, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { financeAlertRules } from "@/lib/db/schema";

import { AddRuleForm, RuleRow } from "./rule-row";

export const dynamic = "force-dynamic";

export default async function FinanceAlertsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const rules = await db
    .select()
    .from(financeAlertRules)
    .where(isNull(financeAlertRules.deletedAt))
    .orderBy(asc(financeAlertRules.metric), asc(financeAlertRules.limitPaise));

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Finance alerts</h1>
        <p className="text-sm text-muted-foreground">
          Get told before money reaches a mark. Each mark is announced twice, once when the figure gets within the warning percentage of it (90% of ₹20 lakh
          is ₹18 lakh) and once when it passes. Each is said only once: a balance that falls back and rises again is announced again, income is announced
          once a financial year. Who is told is set under Settings → Notifications (&ldquo;Money approaching a mark&rdquo;; accounts and admins to start with).
        </p>
      </div>
      <ul className="divide-y rounded-lg border px-3">
        {rules.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No marks yet.</li>}
        {rules.map((r) => (
          <RuleRow key={r.id} id={r.id} metric={r.metric} limitRupees={String(r.limitPaise / 100)} warnPercent={r.warnPercent} label={r.label} isActive={r.isActive} />
        ))}
      </ul>
      <AddRuleForm />
    </div>
  );
}
