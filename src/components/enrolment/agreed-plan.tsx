import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { allocatePayments, type ReceivedPayment } from "@/lib/finance/allocate";
import { formatDateIST } from "@/lib/format/date";
import { formatINR } from "@/lib/format/currency";

/**
 * What the counsellor agreed, and how much of it has actually arrived.
 *
 * The accountant's whole job on a new admission is to answer one question
 * — has this fee been collected? — and until now this screen showed only
 * the total. The instalment dates and amounts the counsellor negotiated,
 * the down payment, what the discount was called: all of it sat on the
 * lead's page, which accounts has no reason to be looking at.
 *
 * Read-only. Accounts records payments against this plan; they do not
 * renegotiate it. Changing the terms is the counsellor's job, on the
 * lead, and keeping that one-way stops two people editing the same
 * agreement from different screens.
 */

export interface AgreedInstalment {
  id: string;
  sequence: number;
  dueDate: string;
  amountPaise: number;
}

export function AgreedPlan({
  totalFeePaise,
  discountPaise,
  discountName,
  downPaymentPaise,
  netFeePaise,
  feeNotes,
  instalments,
  payments,
  asOf,
}: {
  totalFeePaise: number;
  discountPaise: number;
  discountName: string | null;
  downPaymentPaise: number;
  netFeePaise: number;
  feeNotes: string | null;
  instalments: AgreedInstalment[];
  payments: ReceivedPayment[];
  /** `YYYY-MM-DD`, so "overdue" is decided once rather than per row. */
  asOf: string;
}) {
  const allocation = allocatePayments(
    instalments.map((i) => ({
      id: i.id,
      sequence: i.sequence,
      dueDate: i.dueDate,
      amountPaise: i.amountPaise,
    })),
    payments,
    asOf,
  );

  // The plan can legitimately cover less than the net fee — a counsellor
  // may schedule part of it and agree the rest later. Showing the
  // shortfall beats pretending the schedule is the whole story.
  const unscheduledPaise = netFeePaise - downPaymentPaise - allocation.scheduledPaise;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Agreed fee plan</h3>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Line label="Course fee" value={formatINR(totalFeePaise)} />
        <Line
          label={discountName ? `Discount — ${discountName}` : "Discount"}
          value={discountPaise === 0 ? "—" : `− ${formatINR(discountPaise)}`}
        />
        <Line label="Payable" value={formatINR(netFeePaise)} strong />
        <Line
          label="Down payment agreed"
          value={downPaymentPaise === 0 ? "—" : formatINR(downPaymentPaise)}
        />
      </dl>

      {instalments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No instalment schedule was set — the counsellor records one on the lead&apos;s page.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Still owed</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocation.instalments.map((instalment) => (
              <TableRow key={instalment.id}>
                <TableCell className="text-muted-foreground">{instalment.sequence}</TableCell>
                <TableCell>
                  {formatDateIST(`${instalment.dueDate}T00:00:00Z`, "d MMM yyyy")}
                </TableCell>
                <TableCell className="text-right">{formatINR(instalment.amountPaise)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {instalment.paidPaise === 0 ? "—" : formatINR(instalment.paidPaise)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {instalment.outstandingPaise === 0
                    ? "—"
                    : formatINR(instalment.outstandingPaise)}
                </TableCell>
                <TableCell className="text-right">
                  <StatusBadge status={instalment.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-muted-foreground">Received so far </span>
          <span className="font-semibold">{formatINR(allocation.paidPaise)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Still owed </span>
          <span className="font-semibold">{formatINR(allocation.outstandingPaise)}</span>
        </span>
        {unscheduledPaise > 0 && (
          <span className="text-muted-foreground">
            {formatINR(unscheduledPaise)} of the fee is not on the schedule yet
          </span>
        )}
        {allocation.surplusPaise > 0 && (
          <span className="font-semibold text-destructive">
            Overpaid by {formatINR(allocation.surplusPaise)} — worth checking
          </span>
        )}
      </div>

      {feeNotes && (
        <p className="text-sm">
          <span className="text-muted-foreground">Notes from the counsellor: </span>
          {feeNotes}
        </p>
      )}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold" : "font-medium"}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: "paid" | "overdue" | "due_soon" | "upcoming" }) {
  if (status === "paid") return <Badge variant="secondary">Paid</Badge>;
  if (status === "overdue") {
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        Overdue
      </Badge>
    );
  }
  if (status === "due_soon") return <Badge variant="outline">Due soon</Badge>;
  return <span className="text-xs text-muted-foreground">Upcoming</span>;
}
