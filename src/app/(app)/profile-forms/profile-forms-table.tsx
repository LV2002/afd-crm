"use client";

import { ArrowUpDown, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { maskPhone } from "@/lib/leads/mask-phone";
import {
  UNANSWERED,
  UNANSWERED_LABEL,
  answerText,
  compareAnswers,
  matchesColumnFilter,
  type SheetColumn,
} from "@/lib/profile-form/sheet";

export interface ProfileFormRow {
  id: string;
  lead_number: number;
  student_name: string;
  profile_form_submitted_at: string | null;
  profile_form_token: string | null;
  profile_form_data: Record<string, unknown> | null;
  center_id: string | null;
}

export interface SheetColumnWithDefault extends SheetColumn {
  /** The "Show in list" tick in Settings → Custom Fields, which is what decides the opening column set. */
  showInList: boolean;
}

/** shadcn's Select can't hold an empty-string item, so "no filter" needs a token of its own. */
const ANY = "__any__";

/** The three fixed columns, plus `a:<field key>` for any answer column. */
type SortKey = "lead_number" | "student_name" | "submitted" | `a:${string}`;

/**
 * Sorting and filtering happen in the browser rather than the database.
 *
 * AFD runs ~200 leads a month and only a fraction reach this stage, so the
 * whole set is a few hundred rows at most — small enough that a round trip
 * per keystroke would be slower and less pleasant than filtering in place.
 * If this ever outgrows that, it moves server-side with pagination.
 *
 * The answer columns are configuration, not code: which questions can be
 * columns comes from the form's own field definitions, and which are shown
 * to begin with comes from the "Show in list" tick on each of them.
 */
export function ProfileFormsTable({
  rows,
  fieldLabels,
  columns,
  defaultColumns,
  canRevealPhone,
  phoneKeys,
}: {
  rows: ProfileFormRow[];
  fieldLabels: Record<string, string>;
  columns: SheetColumnWithDefault[];
  defaultColumns: string[];
  canRevealPhone: boolean;
  /** Keys of the phone-typed questions, so the expanded row can mask them. */
  phoneKeys: string[];
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("submitted");
  const [ascending, setAscending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [shownKeys, setShownKeys] = useState<string[]>(defaultColumns);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const phoneKeySet = useMemo(() => new Set(phoneKeys), [phoneKeys]);
  const shown = useMemo(
    () => columns.filter((column) => shownKeys.includes(column.key)),
    [columns, shownKeys],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const activeFilters = columns.filter((column) => (filters[column.key] ?? "").length > 0);

    const filtered = rows.filter((row) => {
      const answers = row.profile_form_data ?? {};

      for (const column of activeFilters) {
        if (!matchesColumnFilter(column, answers[column.key], filters[column.key])) return false;
      }

      if (!needle) return true;
      if (row.student_name.toLowerCase().includes(needle)) return true;
      if (String(row.lead_number).includes(needle)) return true;
      // Search the answers too — "Kannur", "NIFT", a school name — since
      // that is what someone is usually looking for.
      return Object.values(answers).some((value) =>
        String(Array.isArray(value) ? value.join(" ") : value)
          .toLowerCase()
          .includes(needle),
      );
    });

    return [...filtered].sort((a, b) => {
      const direction = ascending ? 1 : -1;
      if (sortKey === "lead_number") return (a.lead_number - b.lead_number) * direction;
      if (sortKey === "student_name") {
        return a.student_name.localeCompare(b.student_name) * direction;
      }
      if (sortKey.startsWith("a:")) {
        const column = columns.find((c) => c.key === sortKey.slice(2));
        if (!column) return 0;
        return compareAnswers(
          column,
          (a.profile_form_data ?? {})[column.key],
          (b.profile_form_data ?? {})[column.key],
          ascending,
        );
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
  }, [rows, columns, query, filters, sortKey, ascending]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAscending((current) => !current);
    } else {
      setSortKey(key);
      // A name reads best A–Z; a date and a number read best newest/biggest
      // first, which is what somebody scanning this table is after.
      setAscending(key === "student_name" || key.startsWith("a:"));
    }
  }

  function setFilter(key: string, value: string) {
    setFilters((current) => {
      const next = { ...current };
      if (!value || value === ANY) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function toggleColumn(key: string) {
    setShownKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }

  function SortButton({ column, children }: { column: SortKey; children: React.ReactNode }) {
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className="inline-flex items-center gap-1 font-medium hover:underline"
      >
        {children}
        <ArrowUpDown className={sortKey === column ? "size-3" : "size-3 opacity-40"} />
      </button>
    );
  }

  const activeFilterCount = Object.keys(filters).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a student's name, lead number, or any answer…"
          className="max-w-md"
        />
        {(activeFilterCount > 0 || query) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({});
              setQuery("");
            }}
          >
            Clear {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}` : "search"}
          </Button>
        )}
      </div>

      {columns.length > 0 && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Columns
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {shown.length} of {columns.length} shown — tick a question to add it as a sortable
              column
            </span>
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {columns.map((column) => (
              <div key={column.key} className="flex items-center gap-2">
                <Checkbox
                  id={`col-${column.key}`}
                  checked={shownKeys.includes(column.key)}
                  onCheckedChange={() => toggleColumn(column.key)}
                />
                <Label htmlFor={`col-${column.key}`} className="text-sm font-normal">
                  {column.label}
                </Label>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Which columns open by default is the &quot;Show in list&quot; tick on each question in
            Settings → Custom Fields.
          </p>
        </details>
      )}

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
                <SortButton column="submitted">Submitted</SortButton>
              </TableHead>
              {shown.map((column) => (
                <TableHead key={column.key}>
                  <SortButton column={`a:${column.key}`}>{column.label}</SortButton>
                </TableHead>
              ))}
              <TableHead>Answers</TableHead>
              <TableHead className="text-right">Lead</TableHead>
            </TableRow>
            {shown.length > 0 && (
              <TableRow>
                <TableHead colSpan={3} className="text-xs font-normal text-muted-foreground">
                  Filter
                </TableHead>
                {shown.map((column) => (
                  <TableHead key={column.key} className="py-1">
                    {column.options.length > 0 ? (
                      <Select
                        value={filters[column.key] ?? ANY}
                        onValueChange={(value) => setFilter(column.key, value)}
                      >
                        <SelectTrigger className="h-7 w-full min-w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANY}>Any</SelectItem>
                          <SelectItem value={UNANSWERED}>{UNANSWERED_LABEL}</SelectItem>
                          {column.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={filters[column.key] ?? ""}
                        onChange={(event) => setFilter(column.key, event.target.value)}
                        placeholder="contains…"
                        className="h-7 min-w-32 text-xs"
                      />
                    )}
                  </TableHead>
                ))}
                <TableHead colSpan={2} />
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const data = row.profile_form_data ?? {};
              const answers = Object.entries(data).filter(
                ([, value]) => value !== null && value !== "",
              );
              const isOpen = expanded === row.id;
              return (
                <Fragment key={row.id}>
                  <TableRow>
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
                    {shown.map((column) => {
                      const text = answerText(column, data[column.key]);
                      return (
                        <TableCell key={column.key} className={text ? "" : "text-muted-foreground"}>
                          {text || "—"}
                        </TableCell>
                      );
                    })}
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
                    <TableRow>
                      <TableCell colSpan={5 + shown.length} className="bg-muted/30">
                        <dl className="grid gap-3 p-2 sm:grid-cols-3">
                          {answers.map(([key, value]) => (
                            <div key={key} className="flex flex-col gap-0.5">
                              <dt className="text-xs text-muted-foreground">
                                {fieldLabels[key] ?? key}
                              </dt>
                              <dd className="text-sm">
                                {/*
                                  CLAUDE.md non-negotiable #6: a list is a
                                  bulk view, and a student profile form
                                  carries four phone numbers. Full numbers
                                  are on the lead's own page, behind the
                                  audited reveal.
                                */}
                                {phoneKeySet.has(key) && !canRevealPhone
                                  ? maskPhone(String(value))
                                  : Array.isArray(value)
                                    ? value.join(", ")
                                    : String(value)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
