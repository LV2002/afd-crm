import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { maskPhone } from "@/lib/leads/mask-phone";
import { createClient } from "@/lib/supabase/server";

import { StatusFilter } from "./status-filter";

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

/**
 * Academics' own workspace (CLAUDE.md: academics "should not have to query
 * the sales table") — reads only from `students`, never `leads`. Phone is
 * masked here the same way the leads list masks it: this is still a bulk,
 * scrollable list, and CLAUDE.md non-negotiable #6's concern (a browsable
 * list of contact numbers someone could walk away with) applies just as
 * much to enrolled students as to leads. The detail page shows it in full
 * — see that page's own comment for why no reveal-audit step gates it
 * there, unlike a lead's phone.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "student.read")) return <AccessDenied />;

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : "";
  const status = typeof params.status === "string" ? params.status : "";

  const supabase = await createClient();

  let query = supabase
    .from("students")
    .select("id, student_code, full_name, phone, current_course, status, joined_at, centers(name), batches(name)")
    .is("deleted_at", null);

  if (status) query = query.eq("status", status);
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,student_code.ilike.%${search}%`);
  }

  const { data: rows, error } = await query
    .order("joined_at", { ascending: false })
    .returns<StudentRow[]>();

  if (error) {
    throw new Error(`Failed to load students: ${error.message}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Students</h1>
        <p className="text-sm text-muted-foreground">{(rows ?? []).length} student(s).</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action="/students" method="get" className="contents">
          <Input
            type="search"
            name="search"
            placeholder="Search name, phone or code…"
            defaultValue={search}
            className="h-8 w-64"
          />
          {status && <input type="hidden" name="status" value={status} />}
        </form>
        <StatusFilter value={status} />
      </div>

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
          {(rows ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                No students match.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
