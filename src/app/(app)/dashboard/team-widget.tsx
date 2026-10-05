import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCentreView } from "@/lib/dashboard/get-scoreboard";
import { createClient } from "@/lib/supabase/server";

import { StatTile } from "./stat-tile";

/**
 * How the centre head's people are doing.
 *
 * One row per counsellor who holds a lead, ordered by admissions this
 * month. Deliberately a table rather than a set of cards: the point of this
 * card is comparison between people, and comparison wants columns.
 *
 * Two columns are flagged rather than just counted — never contacted, and
 * overdue follow-ups. Those are the two a head can act on this morning; the
 * rest is context. A number that is merely interesting and a number that
 * needs a conversation should not look the same.
 *
 * Runs through the RLS-bound client, so `leads` and `profiles` policies
 * already restrict this to the head's own centres. No centre filter is
 * written here, and none should be.
 */
export async function TeamWidget() {
  const supabase = await createClient();
  const { centre, team } = await getCentreView(supabase);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Counsellor performance</CardTitle>
        <CardDescription>
          This month, at your centre{centre.unassigned > 0 ? "" : "s"}. Ordered by admissions.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="New leads this month" value={centre.newThisMonth} />
          <StatTile label="Admissions this month" value={centre.admissionsThisMonth} />
          <StatTile
            label="Admission rate"
            value={
              centre.admissionsPerLeadThisMonth === null
                ? "—"
                : `${centre.admissionsPerLeadThisMonth}%`
            }
            hint="Admissions ÷ new leads, this month"
          />
          <StatTile
            label="Never contacted"
            value={centre.neverContacted}
            hint={centre.neverContacted > 0 ? "Across the centre" : "All answered"}
          />
        </div>

        {team.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nobody at your centre is holding a lead yet. Once leads are assigned, each
            counsellor&apos;s figures appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Counsellor</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Admissions</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Not contacted</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.scoreboard.activeLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.scoreboard.newThisMonth}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.scoreboard.admissionsThisMonth}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.scoreboard.admissionsPerLeadThisMonth === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        `${row.scoreboard.admissionsPerLeadThisMonth}%`
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.scoreboard.neverContacted > 0 ? (
                        <Badge variant="destructive">{row.scoreboard.neverContacted}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.scoreboard.overdueFollowups > 0 ? (
                        <Badge variant="secondary">{row.scoreboard.overdueFollowups}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <Link href="/insights/sources" className="text-sm font-medium hover:underline">
            Full insights →
          </Link>
          {centre.unassigned > 0 ? (
            <Link href="/leads/orphans" className="text-sm font-medium hover:underline">
              {centre.unassigned} unassigned →
            </Link>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          &ldquo;Not contacted&rdquo; counts active leads nobody has replied to once, and
          &ldquo;Overdue&rdquo; counts follow-up dates that have passed. Both exclude leads already
          won or lost.
        </p>
      </CardContent>
    </Card>
  );
}
