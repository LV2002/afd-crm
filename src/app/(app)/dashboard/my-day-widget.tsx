import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyDayQueueForUser } from "@/lib/my-day/get-queue";
import { createClient } from "@/lib/supabase/server";

import { StatTile } from "./stat-tile";

export async function MyDayWidget({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { queue } = await getMyDayQueueForUser(supabase, userId);
  const total = queue.overdue.length + queue.dueToday.length + queue.newAssignments.length + queue.atRisk.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your day</CardTitle>
        <CardDescription>
          {total === 0 ? "Nothing needs attention right now." : `${total} lead${total === 1 ? "" : "s"} need attention.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Overdue" value={queue.overdue.length} />
          <StatTile label="Due today" value={queue.dueToday.length} />
          <StatTile label="New" value={queue.newAssignments.length} />
          <StatTile label="At risk" value={queue.atRisk.length} />
        </div>
        <Link href="/my-day" className="text-sm font-medium hover:underline">
          Go to My Day →
        </Link>
      </CardContent>
    </Card>
  );
}
