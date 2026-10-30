import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startOfMonthIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import { measureHref } from "@/lib/dashboard/measures";
import { StatTile } from "./stat-tile";

export async function AdminWidget() {
  const supabase = await createClient();
  const monthStart = startOfMonthIST(new Date()).toISOString();

  const [{ count: newLeadsThisMonth }, { count: admissionsThisMonth }] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", monthStart),
    supabase
      .from("enrolments")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("dropped_at", null)
      .gte("sales_to_accounts_at", monthStart),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organisation</CardTitle>
        <CardDescription>Across every centre, this month.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="New leads" value={newLeadsThisMonth ?? 0} href={measureHref("new_month", "all")} />
          <StatTile label="Admissions" value={admissionsThisMonth ?? 0} href={measureHref("admissions_month", "all")} />
        </div>
        <div className="flex gap-4">
          <Link href="/insights" className="text-sm font-medium hover:underline">
            Marketing & funnel insights →
          </Link>
          <Link href="/settings" className="text-sm font-medium hover:underline">
            Settings →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
