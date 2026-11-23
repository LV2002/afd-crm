"use client";

import { useState } from "react";

import type { CategoryRule } from "@/lib/finance/category-links";
import type { PendingLine } from "@/lib/finance/bank-queries";
import { monthOf } from "@/lib/finance/category-links";
import { formatINR } from "@/lib/format/currency";

import type { PayeeOption } from "./payee-actions";
import { PayeePicker, type PayeeKind } from "./payee-picker";

export interface GatewayAccount {
  id: string;
  name: string;
}

interface Row {
  key: number;
  option: PayeeOption | null;
  rupees: string;
}

const toPaise = (rupees: string): number => Math.round((Number(rupees.replace(/,/g, "")) || 0) * 100);

/**
 * One bank credit that is really several students' payments (a payment
 * gateway settles them together). The amounts the students paid, less what
 * the gateway kept, must come to exactly what the bank received.
 */
function SplitEditor({ line, gateways }: { line: PendingLine; gateways: GatewayAccount[] }) {
  const [rows, setRows] = useState<Row[]>([
    { key: 1, option: null, rupees: "" },
    { key: 2, option: null, rupees: "" },
  ]);
  const [fee, setFee] = useState("");
  const [gateway, setGateway] = useState(gateways[0]?.id ?? "");

  const gross = rows.reduce((sum, r) => sum + toPaise(r.rupees), 0);
  const left = line.amountPaise - (gross - toPaise(fee));
  const allocations = rows.filter((r) => r.option && toPaise(r.rupees) > 0).map((r) => ({ enrolmentId: r.option!.id, amountPaise: toPaise(r.rupees) }));
  const set = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border bg-background p-3">
      <input type="hidden" name={`split:${line.id}`} value={JSON.stringify(allocations)} />
      <input type="hidden" name={`gateway:${line.id}`} value={gateway} />
      <input type="hidden" name={`gatewayFee:${line.id}`} value={fee} />
      <p className="text-xs text-muted-foreground">
        Enter what each student paid. The gateway&apos;s charge comes off, and what is left must equal the {formatINR(line.amountPaise)} the bank received.
      </p>
      {rows.map((r) => (
        <div key={r.key} className="flex flex-wrap items-center gap-2">
          <PayeePicker kind="enrolment" lineId={`${line.id}-${r.key}`} hiddenName={null} onPick={(option) => set(r.key, { option })} />
          <input
            value={r.rupees}
            onChange={(e) => set(r.key, { rupees: e.target.value })}
            inputMode="decimal"
            placeholder="₹ paid"
            className="h-9 w-28 rounded-md border bg-background px-2 text-sm"
            aria-label="Amount this student paid"
          />
          {rows.length > 1 && (
            <button type="button" className="text-xs underline" onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}>
              Remove
            </button>
          )}
        </div>
      ))}
      <button type="button" className="w-fit text-xs underline" onClick={() => setRows((prev) => [...prev, { key: Math.max(...prev.map((p) => p.key)) + 1, option: null, rupees: "" }])}>
        + Add another student
      </button>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Gateway charge</span>
          <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="₹ 0" className="h-9 w-24 rounded-md border bg-background px-2 text-sm" />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Gateway account</span>
          <select value={gateway} onChange={(e) => setGateway(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            {gateways.length === 0 && <option value="">None — add one under Bank &amp; cash accounts</option>}
            {gateways.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <span className={left === 0 ? "font-medium text-green-700 dark:text-green-400" : "font-medium text-destructive"}>
          {left === 0 ? "Adds up" : left > 0 ? `${formatINR(left)} still to assign` : `${formatINR(-left)} too much`}
        </span>
      </div>
    </div>
  );
}

/** What one ticked line needs: whose it is, what month it is for, how to split it, and a comment. */
export function LineDetails({
  line,
  rule,
  pickerKind,
  gateways,
}: {
  line: PendingLine;
  rule: CategoryRule | null;
  pickerKind: PayeeKind | null;
  gateways: GatewayAccount[];
}) {
  const canSplit = rule?.link === "enrolment" && line.direction === "in";
  const [splitting, setSplitting] = useState(false);

  return (
    <div className="flex flex-col gap-2 border-t pt-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64 text-sm">
          <div className="truncate" title={line.particulars}>
            {line.particulars}
          </div>
          <div className="text-xs text-muted-foreground">
            {line.occurredOn} · {formatINR(line.amountPaise)}
          </div>
        </div>
        {pickerKind && !splitting && <PayeePicker key={`${pickerKind}-${line.id}`} kind={pickerKind} lineId={line.id} />}
        {canSplit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={splitting} onChange={(e) => setSplitting(e.target.checked)} />
            Split between several students
          </label>
        )}
        {rule?.asksPeriod && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">For the month of</span>
            <input type="month" name={`period:${line.id}`} defaultValue={monthOf(line.occurredOn)} className="h-9 rounded-md border bg-background px-2 text-sm" />
          </label>
        )}
        <input
          name={`comment:${line.id}`}
          placeholder="Comment (optional) — e.g. which mobile this bill is for"
          maxLength={1000}
          className="h-9 min-w-72 flex-1 rounded-md border bg-background px-3 text-sm"
          aria-label="Comment"
        />
      </div>
      {splitting && <SplitEditor line={line} gateways={gateways} />}
    </div>
  );
}
