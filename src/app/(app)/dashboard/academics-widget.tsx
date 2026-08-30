import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startOfMonthIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import { StatTile } from "./stat-tile";

export async function AcademicsWidget() {
  const supabase = await createClient();
  const monthStart = startOfMonthIST(new Date()).toISOString();

  const [{ count: activeStudents }, { count: joinedThisMonth }] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "active"),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("joined_at", monthStart),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Academics</CardTitle>
        <CardDescription>Students at your centre(s).</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Active students" value={activeStudents ?? 0} />
          <StatTile label="Joined this month" value={joinedThisMonth ?? 0} />
        </div>
        <Link href="/students" className="text-sm font-medium hover:underline">
          Go to Students →
        </Link>
      </CardContent>
    </Card>
  );
}
