import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { maskPhone } from "@/lib/leads/mask-phone";
import { checklistProgress } from "@/lib/students/onboarding-checklist";
import { createClient } from "@/lib/supabase/server";

import { StudentsTabs } from "../students-tabs";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  student_code: string;
  full_name: string;
  phone: string;
  email: string | null;
  current_course: string | null;
  joined_at: string;
  centers: { name: string } | null;
  batches: { name: string } | null;
}

/**
 * Students accounts has handed over that academics has not accepted yet.
 *
 * The missing step in the chain. Gate 2 fires the instant a first payment
 * is recorded and creates the `students` row, and academics — whose whole
 * application is this list and a dashboard — had no way to know. A new name
 * appeared somewhere in two hundred rows ordered by a join date that is
 * almost always today, which is indistinguishable from not being told.
 *
 * Oldest first, deliberately: this is a queue, and the person who has been
 * waiting longest is the one to deal with. The main roster is newest-first
 * because that is a reference list, not a queue.
 *
 * Read through the caller's RLS-bound client, so academics at Kochi see
 * Kochi's arrivals. The batch is shown because it is the thing most likely
 * to be wrong or missing at this point — the counsellor picked it weeks ago
 * and the student may well have changed their mind.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "student.read")) return <AccessDenied />;

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("students")
    .select(
      "id, student_code, full_name, phone, email, current_course, joined_at, centers(name), batches(name)",
    )
    .is("deleted_at", null)
    .is("onboarded_at", null)
    .order("joined_at", { ascending: true })
    .returns<Row[]>();

  if (error) throw new Error(`Failed to load the onboarding queue: ${error.message}`);

  const queue = rows ?? [];
  const progress = await checklistProgress(supabase, queue.map((r) => r.id));

  return (
    <div className="flex flex-col gap-4">
      <StudentsTabs />

      <div>
        <h1 className="text-2xl font-semibold">Onboarding</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Students whose first payment has cleared. Open a student to see their profile form, print it,
          and tick off each onboarding item. They move to the Students list when every item is done.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Course</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Checklist</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queue.map((row) => {
            const done = progress.done.get(row.id) ?? 0;
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/students/${row.id}`} className="font-medium hover:underline">
                    {row.full_name}
                  </Link>
                </TableCell>
                {/*
                  Masked, like every other list in the system. CLAUDE.md
                  non-negotiable #6 is about bulk views, and this is one —
                  the full number is on the student's own page.
                */}
                <TableCell className="font-mono text-sm text-muted-foreground">{maskPhone(row.phone)}</TableCell>
                <TableCell className={row.email ? "" : "text-muted-foreground"}>{row.email ?? "—"}</TableCell>
                <TableCell>{row.current_course ?? "—"}</TableCell>
                <TableCell className={row.batches?.name ? "" : "text-muted-foreground"}>
                  {row.batches?.name ?? "No batch yet"}
                </TableCell>
                <TableCell>
                  <Badge variant={progress.total > 0 && done >= progress.total ? "default" : "secondary"}>
                    {progress.total === 0 ? "Nothing to tick" : `${done} of ${progress.total}`}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
          {queue.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                Nobody waiting. Every student who has paid has been onboarded.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
