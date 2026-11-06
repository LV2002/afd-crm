import { Badge } from "@/components/ui/badge";
import { formatDateIST } from "@/lib/format/date";
import { LEAVE_KIND_LABELS } from "@/lib/hr/leave";
import type { LeaveBalance } from "@/lib/hr/leave";
import type { RequestRow } from "@/lib/hr/queries";

export const dayText = (iso: string) => formatDateIST(`${iso}T12:00:00+05:30`, "d MMM yyyy");

export function rangeText(r: { fromDate: string; toDate: string }) {
  return r.fromDate === r.toDate ? dayText(r.fromDate) : `${dayText(r.fromDate)} – ${dayText(r.toDate)}`;
}

export function StatusBadge({ status }: { status: RequestRow["status"] }) {
  const variant = status === "approved" ? "default" : status === "pending" ? "secondary" : "outline";
  return <Badge variant={variant}>{status === "rejected" ? "turned down" : status}</Badge>;
}

export function kindText(kind: RequestRow["kind"]) {
  return LEAVE_KIND_LABELS[kind];
}

/** Sick and casual: what is left, what is waiting on approval. */
export function BalanceCards({ balance, stacked = false }: { balance: LeaveBalance & { probationLop?: number }; stacked?: boolean }) {
  const cards = [
    { label: "Sick leave", pool: balance.sick },
    { label: "Casual leave", pool: balance.casual },
  ];
  return (
    <div className={stacked ? "grid gap-3" : "grid max-w-xl gap-3 sm:grid-cols-2"}>
      {cards.map(({ label, pool }) => (
        <div key={label} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">
            {label} · {balance.year}
          </p>
          <p className="text-2xl font-semibold">{pool.remaining}</p>
          <p className="text-xs text-muted-foreground">
            of {pool.entitled} · {pool.used} taken
            {pool.pending > 0 ? ` · ${pool.pending} awaiting approval` : ""}
          </p>
          {pool.overdrawn > 0 && (
            <p className="mt-1 text-xs text-red-700">{pool.overdrawn} taken beyond the balance, paid as loss of pay</p>
          )}
        </div>
      ))}
      {(balance.probationLop ?? 0) > 0 && (
        <p className="text-xs text-amber-800 sm:col-span-2">
          In probation, only some leave a month is paid. {balance.probationLop} approved day{balance.probationLop === 1 ? "" : "s"} this
          year will be paid as loss of pay.
        </p>
      )}
    </div>
  );
}
