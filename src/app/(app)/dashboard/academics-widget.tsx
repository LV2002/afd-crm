import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startOfMonthIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import { StatTile } from "./stat-tile";

export async function AcademicsWidget() {
  const supabase = await createClient();
  const monthStart = startOfMonthIST(new Date()).toISOString();

  const [{ count: activeStudents }, { count: joinedThisMonth }, { count: awaitingOnboarding }] =
    await Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("status", "active")
        // Onboarded only, so this agrees with the roster. A student whose
        // payment cleared an hour ago is on the Onboarding tab, and counting
        // them here would make the card disagree with the list it links to.
        .not("onboarded_at", "is", null),
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("joined_at", monthStart),
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .is("onboarded_at", null),
    ]);

  const waiting = awaitingOnboarding ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Students</CardTitle>
        <CardDescription>Enrolled and paid, at your centre(s).</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/*
            Waiting first, because it is the only one of the three that is
            work. The other two are the state of the world; this one is a
            list of people expecting to hear from you.
          */}
          <StatTile label="Waiting to be onboarded" value={waiting} />
          <StatTile label="Active students" value={activeStudents ?? 0} />
          <StatTile label="Joined this month" value={joinedThisMonth ?? 0} />
        </div>
        <div className="flex flex-wrap gap-4">
          {waiting > 0 && (
            <Link
              href="/students/onboarding"
              className="text-sm font-medium text-destructive hover:underline"
            >
              {waiting} waiting to be onboarded →
            </Link>
          )}
          <Link href="/students" className="text-sm font-medium hover:underline">
            Go to Students →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
