"use client";

import { useEffect, useState } from "react";

import { searchEnrolments, searchPayslips, searchStudents, type PayeeOption } from "./payee-actions";

export type PayeeKind = "enrolment" | "student" | "payslip";

const SEARCH = { enrolment: searchEnrolments, student: searchStudents, payslip: searchPayslips } as const;
const PLACEHOLDER = {
  enrolment: "Search the student's name or phone…",
  student: "Search the student's name, phone or code…",
  payslip: "Search the employee's name…",
} as const;

/**
 * Picks the person a bank line is for. The choice is sent with the form as a
 * hidden `kind:lineId` field, so one Apply files every ticked line with its
 * own person.
 */
export function PayeePicker({ kind, lineId }: { kind: PayeeKind; lineId: string }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PayeeOption[]>([]);
  const [picked, setPicked] = useState<PayeeOption | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (picked) return;
    // Payslips are listed before anything is typed (the unpaid ones first); a student needs a few letters.
    if (kind !== "payslip" && query.trim().length < 2) {
      setOptions([]);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const found = await SEARCH[kind](query);
      if (live) setOptions(found);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, query, picked]);

  if (picked) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <input type="hidden" name={`${kind}:${lineId}`} value={picked.id} />
        <span className="font-medium">{picked.label}</span>
        <span className="text-xs text-muted-foreground">{picked.detail}</span>
        <button type="button" className="text-xs underline" onClick={() => setPicked(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={PLACEHOLDER[kind]}
        className="h-9 w-80 rounded-md border bg-background px-3 text-sm"
        aria-label="Who is this for?"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-[28rem] overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="flex w-full flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  setPicked(o);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{o.label}</span>
                <span className="text-xs text-muted-foreground">{o.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
