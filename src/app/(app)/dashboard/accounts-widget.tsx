import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format/currency";
import { startOfDayIST, startOfMonthIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import { StatTile } from "./stat-tile";

interface PaymentRow {
  amount_paise: number;
  direction: "credit" | "debit";
  received_at: string;
}

export async function AccountsWidget() {
  const supabase = await createClient();
  const now = new Date();
  const dayStart = startOfDayIST(now).toISOString();
  const monthStart = startOfMonthIST(now).toISOString();

  const [{ count: awaitingFirstPayment }, { data: paymentRows }] = await Promise.all([
    supabase
      .from("enrolments")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      // Dropped admissions are nobody's queue — see reports.ts.
      .is("dropped_at", null)
      .is("accounts_to_academics_at", null),
    supabase
      .from("payments")
      .select("amount_paise, direction, received_at")
      .gte("received_at", monthStart)
      .returns<PaymentRow[]>(),
  ]);

  let collectedToday = 0;
  let collectedThisMonth = 0;
  for (const p of paymentRows ?? []) {
    const delta = p.direction === "credit" ? p.amount_paise : -p.amount_paise;
    collectedThisMonth += delta;
    if (p.received_at >= dayStart) collectedToday += delta;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounts</CardTitle>
        <CardDescription>Payments awaiting and collected at your centre(s).</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="Awaiting first payment" value={awaitingFirstPayment ?? 0} />
          <StatTile label="Collected today" value={formatINR(collectedToday)} />
          <StatTile label="Collected this month" value={formatINR(collectedThisMonth)} />
        </div>
        <Link href="/accounts" className="text-sm font-medium hover:underline">
          Go to Accounts →
        </Link>
      </CardContent>
    </Card>
  );
}
