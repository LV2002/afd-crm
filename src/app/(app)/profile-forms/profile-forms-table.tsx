"use client";

import { ArrowUpDown, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface ProfileFormRow {
  id: string;
  lead_number: number;
  student_name: string;
  profile_form_submitted_at: string | null;
  profile_form_token: string | null;
  profile_form_data: Record<string, unknown> | null;
  center_id: string | null;
}

type SortKey = "lead_number" | "student_name" | "profile_form_submitted_at";

/**
 * Sorting and filtering happen in the browser rather than the database.
 *
 * AFD runs ~200 leads a month and only a fraction reach this stage, so the
 * whole set is a few hundred rows at most — small enough that a round trip
 * per keystroke would be slower and less pleasant than filtering in place.
 * If this ever outgrows that, it moves server-side with pagination.
 */
export function ProfileFormsTable({
  rows,
  fieldLabels,
}: {
  rows: ProfileFormRow[];
  fieldLabels: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("profile_form_submitted_at");
  const [ascending, setAscending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((row) => {
          if (row.student_name.toLowerCase().includes(needle)) return true;
          if (String(row.lead_number).includes(needle)) return true;
          // Search the answers too — "Kannur", "NIFT", a school name — since
          // that is what someone is usually looking for.
          return Object.values(row.profile_form_data ?? {}).some((value) =>
            String(Array.isArray(value) ? value.join(" ") : value)
              .toLowerCase()
              .includes(needle),
          );
        })
      : rows;

    return [...filtered].sort((a, b) => {
      const direction = ascending ? 1 : -1;
      if (sortKey === "lead_number") return (a.lead_number - b.lead_number) * direction;
      if (sortKey === "student_name") {
        return a.student_name.localeCompare(b.student_name) * direction;
      }
      // Not-yet-submitted rows sort last either way: an empty date is not
      // "oldest", it's "hasn't happened".
      const aAt = a.profile_form_submitted_at;
      const bAt = b.profile_form_submitted_at;
      if (aAt === null && bAt === null) return 0;
      if (aAt === null) return 1;
      if (bAt === null) return -1;
      return (new Date(aAt).getTime() - new Date(bAt).getTime()) * direction;
    });
  }, [rows, query, sortKey, ascending]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAscending((current) => !current);
    } else {
      setSortKey(key);
      setAscending(false);
    }
  }

  function SortButton({ column, children }: { column: SortKey; children: React.ReactNode }) {
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className="inline-flex items-center gap-1 font-medium hover:underline"
      >
        {children}
        <ArrowUpDown className="size-3 opacity-50" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name, lead number, or anything in the answers…"
        className="max-w-md"
      />
      <p className="text-xs text-muted-foreground">
        Showing {visible.length} of {rows.length}.
      </p>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton column="lead_number">Lead #</SortButton>
              </TableHead>
              <TableHead>
                <SortButton column="student_name">Student</SortButton>
              </TableHead>
              <TableHead>
                <SortButton column="profile_form_submitted_at">Submitted</SortButton>
              </TableHead>
              <TableHead>Answers</TableHead>
              <TableHead className="text-right">Lead</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const answers = Object.entries(row.profile_form_data ?? {}).filter(
                ([, value]) => value !== null && value !== "",
              );
              const isOpen = expanded === row.id;
              return (
                <>
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground">{row.lead_number}</TableCell>
                    <TableCell className="font-medium">{row.student_name}</TableCell>
                    <TableCell>
                      {row.profile_form_submitted_at ? (
                        new Date(row.profile_form_submitted_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "Asia/Kolkata",
                        })
                      ) : (
                        <Badge variant="secondary">Awaiting</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {answers.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpanded(isOpen ? null : row.id)}
                        >
                          {isOpen ? "Hide" : `${answers.length} answers`}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/leads/${row.id}`}>
                          Open <ExternalLink className="size-3" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow key={`${row.id}-detail`}>
                      <TableCell colSpan={5} className="bg-muted/30">
                        <dl className="grid gap-3 p-2 sm:grid-cols-3">
                          {answers.map(([key, value]) => (
                            <div key={key} className="flex flex-col gap-0.5">
                              <dt className="text-xs text-muted-foreground">
                                {fieldLabels[key] ?? key}
                              </dt>
                              <dd className="text-sm">
                                {Array.isArray(value) ? value.join(", ") : String(value)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
