import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

import { daysBetween, effectiveDirection } from "./reconcile-plan";

/**
 * What the Reconciliation page shows. Runs on the direct connection with the
 * centre filter applied here, because several of these are joins RLS would
 * make awkward; the page checks `finance.read` first and passes the centres
 * the caller may see (`null` meaning all of them).
 */

/** Entries newer than this many days before the last statement line are "waiting", not "missing". */
export const STATEMENT_LAG_DAYS = 3;
/** A statement older than this is itself flagged: unchecked days are the risk. */
export const STALE_STATEMENT_DAYS = 35;

export interface Coverage {
  accountId: string;
  name: string;
  centerName: string;
  from: string | null;
  to: string | null;
  lines: number;
  daysSince: number | null;
}

export interface ExceptionLine {
  id: string;
  accountId: string;
  accountName: string;
  occurredOn: string;
  particulars: string;
  direction: "in" | "out";
  amountPaise: number;
  /** Entries in the books that could be this line (same amount and direction), nearest first. */
  suggestions: Array<{ id: string; txnNo: number; occurredOn: string; description: string; studentName: string | null }>;
}

export interface ExceptionEntry {
  id: string;
  txnNo: number;
  accountId: string;
  accountName: string;
  occurredOn: string;
  direction: "in" | "out";
  amountPaise: number;
  category: string;
  description: string;
  studentName: string | null;
  recordedByName: string | null;
  /** Statement lines that could be this entry (same amount and direction), nearest first. */
  suggestions: Array<{ id: string; occurredOn: string; particulars: string }>;
}

export interface UnaccountedPayment {
  id: string;
  receivedAt: string;
  amountPaise: number;
  method: string;
  studentName: string;
  enrolmentId: string;
}

export interface WaivedLine {
  matchId: string;
  occurredOn: string;
  particulars: string;
  direction: "in" | "out";
  amountPaise: number;
  reason: string | null;
  byName: string | null;
  at: string;
}

export interface Reconciliation {
  coverage: Coverage[];
  lines: ExceptionLine[];
  entries: ExceptionEntry[];
  /** Entries too recent for a statement to cover yet. Not exceptions. */
  awaitingStatement: number;
  payments: UnaccountedPayment[];
  waived: WaivedLine[];
  matchedCount: number;
}

type Row = Record<string, unknown>;

export async function getReconciliation(centerIds: string[] | null, centerId?: string): Promise<Reconciliation> {
  const centerFilter = centerId
    ? sql`and a.center_id = ${centerId}::uuid`
    : centerIds
      ? centerIds.length
        ? sql`and a.center_id in (${sql.join(centerIds.map((c) => sql`${c}::uuid`), sql`, `)})`
        : sql`and false`
      : sql``;

  const coverageRows = await db.execute<Row>(sql`
    select a.id, a.name, c.name as center_name,
           min(l.occurred_on)::text as from_date, max(l.occurred_on)::text as to_date, count(l.id) as lines
    from finance_accounts a
    join centers c on c.id = a.center_id
    left join bank_statement_lines l on l.account_id = a.id
    where a.type = 'bank' and a.deleted_at is null and a.is_active ${centerFilter}
    group by a.id, a.name, c.name
    order by c.name, a.name
  `);
  const today = new Date().toISOString().slice(0, 10);
  const coverage: Coverage[] = [...coverageRows].map((r) => ({
    accountId: String(r.id),
    name: String(r.name),
    centerName: String(r.center_name),
    from: (r.from_date as string | null) ?? null,
    to: (r.to_date as string | null) ?? null,
    lines: Number(r.lines),
    daysSince: r.to_date ? Math.floor(daysBetween(today, String(r.to_date))) : null,
  }));
  const bounds = new Map(coverage.map((c) => [c.accountId, c]));

  // Statement lines with no active pair (a waiver counts as a pair).
  const lineRows = [
    ...(await db.execute<Row>(sql`
      select l.id, l.account_id, a.name as account_name, l.occurred_on::text as occurred_on,
             l.particulars, l.direction, l.amount_paise
      from bank_statement_lines l
      join finance_accounts a on a.id = l.account_id
      where not exists (select 1 from bank_matches m where m.bank_line_id = l.id and m.active)
        ${centerFilter}
      order by l.occurred_on desc, l.imported_at desc
      limit 500
    `)),
  ];

  // Ledger entries in bank accounts with no active pair, net of mistakes
  // that were reversed before they ever touched the bank.
  const entryRows = [
    ...(await db.execute<Row>(sql`
      select t.id, t.txn_no, t.account_id, a.name as account_name, t.occurred_on::text as occurred_on,
             t.direction, t.amount_paise, t.category, t.description, t.student_name,
             p.full_name as recorded_by_name
      from finance_transactions t
      join finance_accounts a on a.id = t.account_id and a.type = 'bank'
      left join profiles p on p.id = t.recorded_by
      where not exists (select 1 from bank_matches m where m.transaction_id = t.id and m.active)
        and not (
          t.reverses_transaction_id is not null
          and not exists (select 1 from bank_matches m where m.transaction_id = t.reverses_transaction_id and m.active)
        )
        and not exists (select 1 from finance_transactions r where r.reverses_transaction_id = t.id)
        ${centerFilter}
      order by t.occurred_on desc, t.txn_no desc
      limit 1000
    `)),
  ];

  const entriesAll = entryRows.map((r) => ({
    id: String(r.id),
    txnNo: Number(r.txn_no),
    accountId: String(r.account_id),
    accountName: String(r.account_name),
    occurredOn: String(r.occurred_on),
    direction: effectiveDirection(r.direction as "in" | "out" | "transfer_in" | "transfer_out", Number(r.amount_paise)),
    amountPaise: Math.abs(Number(r.amount_paise)),
    category: String(r.category),
    description: String(r.description),
    studentName: (r.student_name as string | null) ?? null,
    recordedByName: (r.recorded_by_name as string | null) ?? null,
  }));

  const lineList = lineRows.map((r) => ({
    id: String(r.id),
    accountId: String(r.account_id),
    accountName: String(r.account_name),
    occurredOn: String(r.occurred_on),
    particulars: String(r.particulars),
    direction: r.direction as "in" | "out",
    amountPaise: Number(r.amount_paise),
  }));

  // Which entries count as missing: those inside the period the statements
  // cover. Before the first statement there is nothing to check against, and
  // the last few days are simply not on a statement yet.
  let awaiting = 0;
  const entries: ExceptionEntry[] = [];
  for (const e of entriesAll) {
    const b = bounds.get(e.accountId);
    if (!b || !b.from || !b.to) continue; // no statement yet for this account
    if (e.occurredOn < b.from) continue;
    const lastDue = new Date(Date.parse(`${b.to}T00:00:00Z`) - STATEMENT_LAG_DAYS * 86_400_000).toISOString().slice(0, 10);
    if (e.occurredOn > lastDue) {
      awaiting += 1;
      continue;
    }
    entries.push({
      ...e,
      suggestions: lineList
        .filter((l) => l.accountId === e.accountId && l.direction === e.direction && l.amountPaise === e.amountPaise)
        .sort((x, y) => daysBetween(x.occurredOn, e.occurredOn) - daysBetween(y.occurredOn, e.occurredOn))
        .slice(0, 3)
        .map((l) => ({ id: l.id, occurredOn: l.occurredOn, particulars: l.particulars })),
    });
  }

  const lines: ExceptionLine[] = lineList.map((l) => ({
    ...l,
    suggestions: entriesAll
      .filter((e) => e.accountId === l.accountId && e.direction === l.direction && e.amountPaise === l.amountPaise)
      .sort((x, y) => daysBetween(x.occurredOn, l.occurredOn) - daysBetween(y.occurredOn, l.occurredOn))
      .slice(0, 3)
      .map((e) => ({
        id: e.id,
        txnNo: e.txnNo,
        occurredOn: e.occurredOn,
        description: e.description,
        studentName: e.studentName,
      })),
  }));

  // Fee payments with no ledger entry at all: money a receipt was issued for
  // that is in no account. Only from the day statements begin, and a payment
  // that was reversed before it reached any account cancels out.
  const firstStatement = coverage.map((c) => c.from).filter((d): d is string => Boolean(d)).sort()[0];
  const payments: UnaccountedPayment[] = firstStatement
    ? [
        ...(await db.execute<Row>(sql`
          select p.id, p.received_at::text as received_at, p.amount_paise, p.method, p.enrolment_id, ld.student_name
          from payments p
          join enrolments e on e.id = p.enrolment_id
          join leads ld on ld.id = e.lead_id
          where not exists (select 1 from finance_transactions t where t.payment_id = p.id)
            and not (
              p.reverses_payment_id is not null
              and not exists (select 1 from finance_transactions t where t.payment_id = p.reverses_payment_id)
            )
            and not exists (select 1 from payments r where r.reverses_payment_id = p.id)
            and p.received_at >= ${firstStatement}::date
            ${centerId ? sql`and e.center_id = ${centerId}::uuid` : centerIds ? (centerIds.length ? sql`and e.center_id in (${sql.join(centerIds.map((c) => sql`${c}::uuid`), sql`, `)})` : sql`and false`) : sql``}
          order by p.received_at desc
          limit 200
        `)),
      ].map((r) => ({
        id: String(r.id),
        receivedAt: String(r.received_at),
        amountPaise: Number(r.amount_paise),
        method: String(r.method),
        studentName: String(r.student_name),
        enrolmentId: String(r.enrolment_id),
      }))
    : [];

  const waivedRows = [
    ...(await db.execute<Row>(sql`
      select m.id as match_id, l.occurred_on::text as occurred_on, l.particulars, l.direction, l.amount_paise,
             m.note, p.full_name as by_name, m.matched_at::text as at
      from bank_matches m
      join bank_statement_lines l on l.id = m.bank_line_id
      join finance_accounts a on a.id = l.account_id
      left join profiles p on p.id = m.matched_by
      where m.active and m.method = 'waived' ${centerFilter}
      order by m.matched_at desc
      limit 200
    `)),
  ];

  const matched = [
    ...(await db.execute<{ n: string }>(sql`
      select count(*) as n from bank_matches m
      join bank_statement_lines l on l.id = m.bank_line_id
      join finance_accounts a on a.id = l.account_id
      where m.active and m.method <> 'waived' ${centerFilter}
    `)),
  ][0];

  return {
    coverage,
    lines,
    entries,
    awaitingStatement: awaiting,
    payments,
    waived: waivedRows.map((r) => ({
      matchId: String(r.match_id),
      occurredOn: String(r.occurred_on),
      particulars: String(r.particulars),
      direction: r.direction as "in" | "out",
      amountPaise: Number(r.amount_paise),
      reason: (r.note as string | null) ?? null,
      byName: (r.by_name as string | null) ?? null,
      at: String(r.at),
    })),
    matchedCount: Number(matched?.n ?? 0),
  };
}

/** The number on the tab: everything that needs a person to look. */
export async function countExceptions(centerIds: string[] | null): Promise<number> {
  const r = await getReconciliation(centerIds);
  return r.lines.length + r.entries.length + r.payments.length;
}
