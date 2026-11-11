import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { financeAlertRules, financeAlertState, orgSettings, type FinanceAlertMetric } from "@/lib/db/schema";
import { formatINR } from "@/lib/format/currency";
import { notify } from "@/lib/notifications/notify";

/**
 * Telling people before money reaches a mark.
 *
 * A rule names a figure (the bank balance, or income so far this financial
 * year), a mark in rupees, and how close counts as "about to": by default
 * 90 percent of it. Crossing that line announces it once; passing the mark
 * itself announces it once more. Each is said once and then remembered, so
 * a figure hovering around the line does not ring every ten minutes.
 */

export type ThresholdStage = "below" | "warn" | "reached";

export function thresholdStage(valuePaise: number, limitPaise: number, warnPercent: number): ThresholdStage {
  if (valuePaise >= limitPaise) return "reached";
  if (valuePaise >= Math.floor((limitPaise * warnPercent) / 100)) return "warn";
  return "below";
}

/** The financial year containing a date, named by the year it starts in ("2026-27"), with its bounds. */
export function financialYearOf(todayIst: string, startMonth: number): { key: string; from: string; to: string } {
  const year = Number(todayIst.slice(0, 4));
  const month = Number(todayIst.slice(5, 7));
  const startYear = month >= startMonth ? year : year - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${startYear}-${pad(startMonth)}-01`;
  const endMonthIndex = startMonth - 1; // month before the start month, next year
  const endYear = startMonth === 1 ? startYear : startYear + 1;
  const endMonth = startMonth === 1 ? 12 : endMonthIndex;
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  return {
    key: `${startYear}-${pad((startYear + 1) % 100)}`,
    from,
    to: `${endYear}-${pad(endMonth)}-${pad(lastDay)}`,
  };
}

const METRIC_LABEL: Record<FinanceAlertMetric, string> = {
  bank_balance: "The bank balance",
  income_fy: "Income this financial year",
};

export async function bankBalancePaise(): Promise<number> {
  const [row] = await db.execute<{ total: string | null }>(sql`
    select coalesce(sum(
      a.opening_balance_paise + coalesce((
        select sum(case when t.direction in ('in','transfer_in') then t.amount_paise else -t.amount_paise end)
        from finance_transactions t
        where t.account_id = a.id and (a.opening_as_of is null or t.occurred_on > a.opening_as_of)
      ), 0)
    ), 0) as total
    from finance_accounts a
    where a.type = 'bank' and a.deleted_at is null
  `);
  return Number(row?.total ?? 0);
}

export async function incomeInPaise(from: string, to: string): Promise<number> {
  const [row] = await db.execute<{ total: string | null }>(sql`
    select coalesce(sum(amount_paise), 0) as total
    from finance_transactions
    where direction = 'in' and occurred_on between ${from}::date and ${to}::date
  `);
  return Number(row?.total ?? 0);
}

/**
 * Looks at every active rule and tells people about any mark newly close to
 * or passed. Safe to run as often as you like, and from two places at once:
 * the claim on each stage is an insert that only one caller can win.
 */
export async function checkFinanceThresholds(
  now: Date = new Date(),
  /** For tests: the figures to judge instead of reading the ledger. */
  figures?: { balancePaise: number; incomePaise: number },
): Promise<{ checked: number; announced: number }> {
  const rules = await db
    .select()
    .from(financeAlertRules)
    .where(and(eq(financeAlertRules.isActive, true), isNull(financeAlertRules.deletedAt)));
  if (rules.length === 0) return { checked: 0, announced: 0 };

  const [org] = await db.select({ month: orgSettings.fiscalYearStartMonth }).from(orgSettings).limit(1);
  const todayIst = new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const fy = financialYearOf(todayIst, org?.month ?? 4);

  const needsBalance = rules.some((r) => r.metric === "bank_balance");
  const needsIncome = rules.some((r) => r.metric === "income_fy");
  const [balance, income] = await Promise.all([
    figures ? Promise.resolve(figures.balancePaise) : needsBalance ? bankBalancePaise() : Promise.resolve(0),
    figures ? Promise.resolve(figures.incomePaise) : needsIncome ? incomeInPaise(fy.from, fy.to) : Promise.resolve(0),
  ]);

  let announced = 0;
  for (const rule of rules) {
    const value = rule.metric === "bank_balance" ? balance : income;
    const periodKey = rule.metric === "income_fy" ? fy.key : "now";
    const stage = thresholdStage(value, rule.limitPaise, rule.warnPercent);

    // A balance can fall and rise again; once it is clearly back under the
    // line the mark is armed again. Income only grows within a year.
    if (stage === "below") {
      if (rule.metric === "bank_balance") {
        await db.delete(financeAlertState).where(and(eq(financeAlertState.ruleId, rule.id), eq(financeAlertState.periodKey, periodKey)));
      }
      continue;
    }

    // Passing the mark in one jump skips the warning, and should not then
    // announce it a second time.
    const stages: Array<"warn" | "reached"> = stage === "reached" ? ["warn", "reached"] : ["warn"];
    for (const s of stages) {
      const [claimed] = await db
        .insert(financeAlertState)
        .values({ ruleId: rule.id, periodKey, stage: s })
        .onConflictDoNothing()
        .returning({ ruleId: financeAlertState.ruleId });
      if (!claimed || s !== stage) continue;

      const told = await notify({
        eventKey: "finance.threshold",
        context: {
          metric: METRIC_LABEL[rule.metric],
          amount: formatINR(value),
          limit: rule.label,
          status: stage === "reached" ? "over" : "close to",
        },
        href: "/finance",
        entityType: "finance_alert_rules",
        entityId: rule.id,
      });
      announced += told > 0 ? 1 : 0;
    }
  }
  return { checked: rules.length, announced };
}
