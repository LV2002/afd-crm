"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { moveContactsToLeads, revealContactPhone, type PromoteRowResult } from "./actions";

export interface ContactRow {
  id: string;
  name: string;
  maskedPhone: string | null;
  hasPhone: boolean;
  email: string | null;
  className: string | null;
  city: string | null;
  lists: string[];
  /** Already moved or merged into this lead. */
  linked: { leadId: string; leadNumber: number; how: string | null } | null;
  /** The same person is a lead already, but no move or merge has been done from here. */
  match: { leadId: string; leadNumber: number; counsellor: string | null } | null;
}

export function ContactsTable({
  rows,
  canPromote,
  canReveal,
  canManage,
}: {
  rows: ContactRow[];
  canPromote: boolean;
  canReveal: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [report, setReport] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Only people who can be acted on are tickable: not already linked, and
  // with a phone number, which a lead requires.
  const tickable = rows.filter((r) => !r.linked && r.hasPhone);
  const selected = tickable.filter((r) => picked.has(r.id));
  const mergeCount = selected.filter((r) => r.match).length;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function run(ids: string[]) {
    setReport(null);
    startTransition(async () => {
      const outcome = await moveContactsToLeads(ids);
      if (outcome.error) {
        setReport(outcome.error);
        return;
      }
      setReport(summarise(outcome.results ?? []));
      setPicked(new Set());
      router.refresh();
    });
  }

  async function reveal(id: string) {
    const result = await revealContactPhone(id);
    if (result.phone) setRevealed((r) => ({ ...r, [id]: result.phone as string }));
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nobody here yet.{canManage && " Add a contact, or import a file."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canPromote && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <span className="text-sm">
            {selected.length === 0
              ? "Tick people to move them into the leads"
              : `${selected.length} selected${mergeCount > 0 ? ` · ${mergeCount} already a lead (will merge)` : ""}`}
          </span>
          <Button size="sm" disabled={pending || selected.length === 0} onClick={() => run(selected.map((r) => r.id))}>
            {pending ? "Working…" : selected.length > 0 && mergeCount === selected.length ? "Merge selected" : "Move selected to leads"}
          </Button>
          {report && <span className="text-sm text-muted-foreground">{report}</span>}
        </div>
      )}
      {!canPromote && report && <p className="text-sm text-muted-foreground">{report}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            {canPromote && <TableHead className="w-8" />}
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Lists</TableHead>
            <TableHead>Lead?</TableHead>
            {canPromote && <TableHead className="text-right" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const actionable = !r.linked && r.hasPhone;
            return (
              <TableRow key={r.id}>
                {canPromote && (
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.name}`}
                      disabled={!actionable}
                      checked={picked.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Link href={`/database/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {revealed[r.id] ?? r.maskedPhone ?? <span className="text-muted-foreground">—</span>}
                  {canReveal && r.hasPhone && !revealed[r.id] && (
                    <button type="button" onClick={() => reveal(r.id)} className="ml-2 text-xs underline">
                      Show
                    </button>
                  )}
                </TableCell>
                <TableCell>{r.className ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>{r.city ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="max-w-56 text-xs text-muted-foreground">{r.lists.join(", ")}</TableCell>
                <TableCell>
                  {r.linked ? (
                    <Badge variant="secondary">
                      <Link href={`/leads/${r.linked.leadId}`}>
                        {r.linked.how === "merged" ? "Merged" : "Moved"} · Lead #{r.linked.leadNumber}
                      </Link>
                    </Badge>
                  ) : r.match ? (
                    <Badge variant="outline" title={r.match.counsellor ? `With ${r.match.counsellor}` : "Unassigned"}>
                      Already a lead · #{r.match.leadNumber}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {canPromote && (
                  <TableCell className="text-right">
                    {actionable ? (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run([r.id])}>
                        {r.match ? "Merge" : "Move to leads"}
                      </Button>
                    ) : !r.linked && !r.hasPhone ? (
                      <span className="text-xs text-muted-foreground">Needs a phone</span>
                    ) : null}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function summarise(results: PromoteRowResult[]): string {
  let moved = 0;
  let merged = 0;
  const failures: string[] = [];
  for (const { result } of results) {
    if (!result.ok) failures.push(result.error);
    else if (result.how === "moved") moved++;
    else merged++;
  }
  const parts: string[] = [];
  if (moved) parts.push(`${moved} moved into the leads`);
  if (merged) parts.push(`${merged} merged with an existing lead`);
  if (failures.length) parts.push(`${failures.length} could not be done: ${failures[0]}`);
  return parts.join(" · ") || "Nothing to do.";
}
