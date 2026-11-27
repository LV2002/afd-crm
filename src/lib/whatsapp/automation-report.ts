import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

/**
 * How much the automations sent, and what it cost, over a stretch of days.
 *
 * Counted from the automation runs' own record of what they sent (so it is
 * exact the moment a message goes out), with what Meta then said about each:
 * delivered, read, failed. Cost is what Meta billed (`whatsapp_spend`, filled
 * from its delivery reports), so a message sent a minute ago shows as sent
 * with its cost to follow.
 */
export interface AutomationRow {
  flowId: string;
  name: string;
  audience: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  /** Messages Meta billed for. */
  billable: number;
  /** Ten-thousandths of a rupee. */
  cost: number;
}

export interface AutomationDay {
  /** yyyy-MM-dd, India time. */
  date: string;
  sent: number;
  cost: number;
}

export interface AutomationReport {
  totals: Omit<AutomationRow, "flowId" | "name" | "audience">;
  rows: AutomationRow[];
  days: AutomationDay[];
}

const IST = "Asia/Kolkata";

export async function automationReport(days: number, now: Date = new Date()): Promise<AutomationReport> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();

  const events = [
    ...(await db.execute<{ flow_id: string; name: string; audience: string; sent: number; delivered: number; read: number; failed: number }>(sql`
      select f.id as flow_id, f.name, f.audience,
        count(*) filter (where e.kind = 'sent')::int as sent,
        count(*) filter (where e.kind = 'delivered')::int as delivered,
        count(*) filter (where e.kind = 'read')::int as read,
        count(*) filter (where e.kind = 'delivery_failed')::int as failed
      from whatsapp_flows f
      left join whatsapp_flow_runs r on r.flow_id = f.id
      left join whatsapp_flow_run_events e on e.run_id = r.id
        and e.created_at >= ${since}::timestamptz
        and e.kind in ('sent', 'delivered', 'read', 'delivery_failed')
      where f.deleted_at is null
      group by f.id, f.name, f.audience
      order by f.name`)),
  ];

  const spend = [
    ...(await db.execute<{ flow_id: string; billable: number; cost: number }>(sql`
      select flow_id, count(*) filter (where billable)::int as billable,
             coalesce(sum(amount_ten_thousandths), 0)::bigint::int as cost
      from whatsapp_spend
      where flow_id is not null and occurred_at >= ${since}::timestamptz
      group by flow_id`)),
  ];
  const spendByFlow = new Map(spend.map((row) => [row.flow_id, row]));

  const rows: AutomationRow[] = events.map((row) => ({
    flowId: row.flow_id,
    name: row.name,
    audience: row.audience,
    sent: row.sent,
    delivered: row.delivered,
    read: row.read,
    failed: row.failed,
    billable: spendByFlow.get(row.flow_id)?.billable ?? 0,
    cost: spendByFlow.get(row.flow_id)?.cost ?? 0,
  }));

  const sentByDay = [
    ...(await db.execute<{ day: string; sent: number }>(sql`
      select to_char((e.created_at at time zone ${IST})::date, 'YYYY-MM-DD') as day, count(*)::int as sent
      from whatsapp_flow_run_events e
      where e.kind = 'sent' and e.created_at >= ${since}::timestamptz
      group by 1`)),
  ];
  const costByDay = [
    ...(await db.execute<{ day: string; cost: number }>(sql`
      select to_char((occurred_at at time zone ${IST})::date, 'YYYY-MM-DD') as day,
             coalesce(sum(amount_ten_thousandths), 0)::bigint::int as cost
      from whatsapp_spend
      where flow_id is not null and occurred_at >= ${since}::timestamptz
      group by 1`)),
  ];
  const sentMap = new Map(sentByDay.map((r) => [r.day, r.sent]));
  const costMap = new Map(costByDay.map((r) => [r.day, r.cost]));

  // Every day in the range, so a quiet day is a zero and not a gap.
  const dayList: AutomationDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now.getTime() - i * 86_400_000 + 19_800_000).toISOString().slice(0, 10);
    dayList.push({ date, sent: sentMap.get(date) ?? 0, cost: costMap.get(date) ?? 0 });
  }

  const totals = rows.reduce(
    (acc, row) => ({
      sent: acc.sent + row.sent,
      delivered: acc.delivered + row.delivered,
      read: acc.read + row.read,
      failed: acc.failed + row.failed,
      billable: acc.billable + row.billable,
      cost: acc.cost + row.cost,
    }),
    { sent: 0, delivered: 0, read: 0, failed: 0, billable: 0, cost: 0 },
  );

  return { totals, rows, days: dayList };
}
