"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { categoriseLines, type BankFormState } from "@/lib/finance/bank-actions";
import type { PendingLine } from "@/lib/finance/bank-queries";
import { formatINR } from "@/lib/format/currency";

const initial: BankFormState = {};

interface Props {
  lines: PendingLine[];
  total: number;
  page: number;
  pageSize: number;
  accountNames: Record<string, string>;
  accounts: Array<{ id: string; name: string }>;
  filters: { account: string; dir: string; q: string };
  incomeCategories: string[];
  expenseCategories: string[];
  skipOptions: Array<{ value: string; label: string }>;
}

function pageHref(filters: Props["filters"], page: number): string {
  const p = new URLSearchParams();
  if (filters.account) p.set("account", filters.account);
  if (filters.dir) p.set("dir", filters.dir);
  if (filters.q) p.set("q", filters.q);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return qs ? `/finance/bank?${qs}` : "/finance/bank";
}

export function PendingQueue(props: Props) {
  const { lines, total, page, pageSize, filters } = props;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState(categoriseLines, initial);

  // Ticks for rows that have since been categorised are dropped, not carried.
  const selected = useMemo(() => lines.filter((l) => picked.has(l.id)), [lines, picked]);
  const kinds = new Set(selected.map((l) => l.direction));
  const mixed = kinds.size > 1;
  const direction = kinds.size === 1 ? [...kinds][0] : null;
  const options = direction === "in" ? props.incomeCategories : props.expenseCategories;
  const selectedTotal = selected.reduce((s, l) => s + l.amountPaise, 0);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allTicked = lines.length > 0 && lines.every((l) => picked.has(l.id));

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">To categorise</h2>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Nothing waiting — every imported transaction has been categorised."
              : `${total} transaction${total === 1 ? "" : "s"} waiting. Tick the ones that belong together (all the Google Ads credits, say), choose a category, and apply.`}
          </p>
        </div>
      </div>

      <form method="get" action="/finance/bank" className="flex flex-wrap items-end gap-2">
        {props.accounts.length > 1 && (
          <select
            name="account"
            defaultValue={filters.account}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">All bank accounts</option>
            {props.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <select
          name="dir"
          defaultValue={filters.dir}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Credits and debits</option>
          <option value="in">Credits (money in)</option>
          <option value="out">Debits (money out)</option>
        </select>
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Search narration or note…"
          className="h-9 w-64 rounded-md border bg-background px-3 text-sm"
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {(filters.account || filters.dir || filters.q) && (
          <Link href="/finance/bank" className="text-sm underline">
            Clear
          </Link>
        )}
      </form>

      {lines.length > 0 && (
        <form
          action={action}
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3"
        >
          {selected.map((l) => (
            <input key={l.id} type="hidden" name="ids" value={l.id} />
          ))}
          <span className="text-sm">
            {selected.length === 0
              ? "Tick transactions to categorise them"
              : `${selected.length} selected · ${formatINR(selectedTotal)}`}
          </span>
          {mixed && (
            <span className="text-sm text-destructive">
              Credits and debits are ticked together — tick one kind at a time.
            </span>
          )}
          <select
            name="choice"
            required
            disabled={selected.length === 0 || mixed}
            defaultValue=""
            key={direction ?? "none"}
            className="h-9 min-w-56 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">
              {direction === "in" ? "Income category…" : direction === "out" ? "Expense category…" : "Category…"}
            </option>
            {direction && (
              <optgroup label={direction === "in" ? "Income" : "Expense"}>
                {options.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            )}
            {direction && (
              <optgroup label="Not income or expense">
                {props.skipOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <Button type="submit" disabled={pending || selected.length === 0 || mixed}>
            {pending ? "Saving…" : "Apply"}
          </Button>
          <FormMessage error={state.error} success={state.success} />
        </form>
      )}

      {lines.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  aria-label="Tick all on this page"
                  checked={allTicked}
                  onChange={() => setPicked(allTicked ? new Set() : new Set(lines.map((l) => l.id)))}
                />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Particulars</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Debit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow
                key={l.id}
                data-state={picked.has(l.id) ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => toggle(l.id)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Tick ${l.particulars}`}
                    checked={picked.has(l.id)}
                    onChange={() => toggle(l.id)}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {l.occurredOn}
                  {l.dateGuessed && (
                    <Badge variant="outline" className="ml-2" title="The file's year was unusable; taken from nearby lines.">
                      check date
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-xl">
                  <div className="break-words text-sm">{l.particulars}</div>
                  {l.note && <div className="text-xs text-muted-foreground">{l.note}</div>}
                  {Object.keys(props.accountNames).length > 1 && (
                    <div className="text-xs text-muted-foreground">{props.accountNames[l.accountId]}</div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-green-700 dark:text-green-400">
                  {l.direction === "in" ? formatINR(l.amountPaise) : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.direction === "out" ? formatINR(l.amountPaise) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {lastPage > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={pageHref(filters, page - 1)} className="underline">← Newer</Link>}
          <span className="text-muted-foreground">
            Page {page} of {lastPage}
          </span>
          {page < lastPage && <Link href={pageHref(filters, page + 1)} className="underline">Older →</Link>}
        </div>
      )}
    </section>
  );
}
