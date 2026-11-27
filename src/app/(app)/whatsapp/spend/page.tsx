import { sql } from "drizzle-orm";
import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { CATEGORY_LABELS, formatRate, formatTotal } from "@/lib/whatsapp/pricing";
import { loadRates } from "@/lib/whatsapp/spend";

import { RatesForm } from "./rates-form";

export const dynamic = "force-dynamic";

interface Row extends Record<string, unknown> {
  label: string | null;
  messages: number;
  billable: number;
  total: number;
}

/** First instant of an India-time month, as a timestamp the database compares against. */
function monthBounds(param: string | undefined): { month: string; start: string; end: string } {
  const now = new Date(Date.now() + 19_800_000);
  const fallback = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : fallback;
  const [y, m] = month.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return {
    month,
    start: `${month}-01T00:00:00+05:30`,
    end: `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+05:30`,
  };
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function SpendPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;
  const { month, start, end } = monthBounds((await searchParams).month);
  const canEditRates = can(user, "settings.manage");

  const window = sql`s.occurred_at >= ${start}::timestamptz and s.occurred_at < ${end}::timestamptz`;
  const group = async (select: ReturnType<typeof sql>, joins: ReturnType<typeof sql>, by: ReturnType<typeof sql>) =>
    [
      ...(await db.execute<Row>(sql`
        select ${select} as label, count(*)::int as messages,
               count(*) filter (where s.billable)::int as billable,
               coalesce(sum(s.amount_ten_thousandths), 0)::bigint::int as total
        from whatsapp_spend s ${joins}
        where ${window}
        group by ${by}
        order by total desc, messages desc
        limit 50`)),
    ];

  const [totals, byCategory, byBroadcast, byFlow, rates] = await Promise.all([
    group(sql`'All'`, sql``, sql`1`),
    group(sql`s.category`, sql``, sql`s.category`),
    group(
      sql`b.name`,
      sql`join whatsapp_broadcasts b on b.id = s.broadcast_id`,
      sql`b.id, b.name`,
    ),
    group(sql`f.name`, sql`join whatsapp_flows f on f.id = s.flow_id`, sql`f.id, f.name`),
    loadRates(),
  ]);

  const all = totals[0] ?? { label: "All", messages: 0, billable: 0, total: 0 };
  const rateText = Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, formatRate(v).slice(1)]));

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        What WhatsApp has billed for the messages you sent, from Meta&apos;s own delivery reports — so it appears once a
        message has gone out, not before. To see what a broadcast or automation <em>will</em> cost, look on its own page
        before you send.
      </p>

      <div className="flex items-center gap-3 text-sm">
        <Link href={`/whatsapp/spend?month=${shiftMonth(month, -1)}`} className="underline">
          ← {shiftMonth(month, -1)}
        </Link>
        <span className="font-semibold">{month}</span>
        <Link href={`/whatsapp/spend?month=${shiftMonth(month, 1)}`} className="underline">
          {shiftMonth(month, 1)} →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Spent this month</p>
          <p className="text-2xl font-semibold">{formatTotal(all.total)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Messages reported</p>
          <p className="text-2xl font-semibold">{all.messages.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Billable</p>
          <p className="text-2xl font-semibold">{all.billable.toLocaleString("en-IN")}</p>
        </div>
      </div>

      <SpendTable title="By category" first="Category" rows={byCategory.map((r) => ({ ...r, label: CATEGORY_LABELS[r.label ?? ""] ?? r.label }))} />
      <SpendTable title="By broadcast" first="Broadcast" rows={byBroadcast} />
      <SpendTable title="By automation" first="Automation" rows={byFlow} />

      {canEditRates && <RatesForm rates={rateText} />}
    </div>
  );
}

function SpendTable({ title, first, rows }: { title: string; first: string; rows: Row[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet this month.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{first}</TableHead>
              <TableHead>Messages</TableHead>
              <TableHead>Billable</TableHead>
              <TableHead>Spent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={`${r.label}-${i}`}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell>{r.messages.toLocaleString("en-IN")}</TableCell>
                <TableCell>{r.billable.toLocaleString("en-IN")}</TableCell>
                <TableCell>{formatTotal(r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
