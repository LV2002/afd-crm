import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterTerm } from "@/lib/db/filter-term";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { maskPhone } from "@/lib/leads/mask-phone";
import { createClient } from "@/lib/supabase/server";

import { StudentFilters, type StudentFilterOption } from "./student-filters";
import { StudentsTabs } from "./students-tabs";

interface StudentRow {
  id: string;
  student_code: string;
  full_name: string;
  phone: string;
  current_course: string | null;
  status: string;
  joined_at: string;
  centers: { name: string } | null;
  batches: { name: string } | null;
}

/** The four values `student_status` can take. A fixed vocabulary, not a dropdown. */
const STATUSES: StudentFilterOption[] = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Academics' own workspace (CLAUDE.md: academics "should not have to query
 * the sales table") — reads only from `students`, never `leads`. Phone is
 * masked here the same way the leads list masks it: this is still a bulk,
 * scrollable list, and CLAUDE.md non-negotiable #6's concern (a browsable
 * list of contact numbers someone could walk away with) applies just as
 * much to enrolled students as to leads. The detail page shows it in full
 * — see that page's own comment for why no reveal-audit step gates it
 * there, unlike a lead's phone.
 *
 * Every column on the table is filterable. It used to be search and status
 * only, which left "the Kochi Foundation students who joined in July"
 * unaskable — and that is the question academics has every time a batch
 * starts.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "student.read")) return <AccessDenied />;

  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");

  const search = one("search");
  const centerId = one("center");
  const course = one("course");
  const batchId = one("batch");
  const status = one("status");
  // Anything that is not an ISO date is dropped rather than passed to
  // Postgres, which would otherwise reject the whole query and blank the
  // page over a typed URL.
  const joinedFrom = ISO_DATE.test(one("from")) ? one("from") : "";
  const joinedTo = ISO_DATE.test(one("to")) ? one("to") : "";

  const supabase = await createClient();

  let query = supabase
    .from("students")
    .select("id, student_code, full_name, phone, current_course, status, joined_at, centers(name), batches(name)")
    .is("deleted_at", null)
    // The roster is people academics has accepted. A student whose payment
    // cleared this morning is on the Onboarding tab instead — appearing
    // unannounced in a list of two hundred was exactly the problem, see
    // students-tabs.tsx.
    .not("onboarded_at", "is", null);

  if (status) query = query.eq("status", status);
  if (centerId) query = query.eq("center_id", centerId);
  if (course) query = query.eq("current_course", course);
  if (batchId) query = query.eq("current_batch_id", batchId);
  if (joinedFrom) query = query.gte("joined_at", `${joinedFrom}T00:00:00+05:30`);
  // Exclusive upper bound on the next day, so "to 15 July" includes
  // everybody who joined during the 15th rather than only at midnight.
  if (joinedTo) query = query.lt("joined_at", `${joinedTo}T23:59:59.999+05:30`);

  // See lib/db/filter-term.ts — the same guard the leads list uses.
  const searchFilter = filterTerm(search);
  if (searchFilter) {
    query = query.or(
      `full_name.ilike.%${searchFilter}%,phone.ilike.%${searchFilter}%,student_code.ilike.%${searchFilter}%`,
    );
  }

  // The filter options come from what exists, not from a hardcoded list:
  // centres and batches are rows, and the course list is the same
  // admin-editable dropdown the rest of the system uses.
  const [{ data: rows, error }, { data: centreRows }, { data: batchRows }, { data: courseRows }] =
    await Promise.all([
      query.order("joined_at", { ascending: false }).returns<StudentRow[]>(),
      supabase
        .from("centers")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name")
        .returns<Array<{ id: string; name: string }>>(),
      supabase
        .from("batches")
        .select("id, name, academic_year")
        .is("deleted_at", null)
        .order("name")
        .returns<Array<{ id: string; name: string; academic_year: string }>>(),
      supabase
        .from("dropdown_options")
        .select("value, label")
        .eq("category", "course")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order")
        .returns<Array<{ value: string; label: string }>>(),
    ]);

  if (error) {
    throw new Error(`Failed to load students: ${error.message}`);
  }

  const total = (rows ?? []).length;
  const anyFilter = Boolean(
    search || centerId || course || batchId || status || joinedFrom || joinedTo,
  );

  return (
    <div className="flex flex-col gap-4">
      <StudentsTabs />

      <div>
        <h1 className="text-2xl font-semibold">Students</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {anyFilter ? `${total} matching` : `${total}`} student{total === 1 ? "" : "s"}. Everybody
          here has paid their first fee and been onboarded by academics. Somebody who has just paid
          is on the <strong>Onboarding</strong> tab until that is done.
        </p>
      </div>

      <StudentFilters
        values={{ search, centerId, course, batchId, status, joinedFrom, joinedTo }}
        centres={(centreRows ?? []).map((row) => ({ value: row.id, label: row.name }))}
        courses={(courseRows ?? []).map((row) => ({ value: row.value, label: row.label }))}
        batches={(batchRows ?? []).map((row) => ({
          value: row.id,
          label: `${row.name} · ${row.academic_year}`,
        }))}
        statuses={STATUSES}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Centre</TableHead>
            <TableHead>Course</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.student_code}</TableCell>
              <TableCell>
                <Link href={`/students/${row.id}`} className="font-medium hover:underline">
                  {row.full_name}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">{maskPhone(row.phone)}</TableCell>
              <TableCell>{row.centers?.name ?? "—"}</TableCell>
              <TableCell>{row.current_course ?? "—"}</TableCell>
              <TableCell>{row.batches?.name ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={row.status === "active" ? "default" : "secondary"}>{row.status}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDateIST(row.joined_at, "d MMM yyyy")}</TableCell>
            </TableRow>
          ))}
          {total === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                {anyFilter
                  ? "No students match these filters."
                  : "No students yet. One appears the moment accounts take a first payment."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
