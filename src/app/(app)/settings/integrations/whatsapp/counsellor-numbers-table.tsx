"use client";

import { useActionState, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { saveCounsellorNumber, testCounsellorNumber, type CounsellorNumberRow, type WhatsAppFormState } from "./actions";

const initialState: WhatsAppFormState = {};

function CounsellorRow({ row }: { row: CounsellorNumberRow }) {
  const [state, formAction, pending] = useActionState(saveCounsellorNumber, initialState);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, startTest] = useTransition();

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{row.fullName}</span>
          <span className="text-xs text-muted-foreground">{row.email}</span>
        </div>
      </TableCell>
      <TableCell>
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="profileId" value={row.id} />
          <Input
            name="phoneNumberId"
            placeholder={row.hasNumber ? "Leave blank to keep current" : "Phone number id"}
            className="h-8 w-40"
          />
          <Input name="displayName" defaultValue={row.whatsappDisplayName ?? ""} placeholder="Display label" className="h-8 w-32" />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
        {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
        {state.success && <p className="mt-1 text-xs text-emerald-600">{state.success}</p>}
      </TableCell>
      <TableCell>
        <Badge variant={row.hasNumber ? "default" : "secondary"}>{row.hasNumber ? "Assigned" : "Not assigned"}</Badge>
      </TableCell>
      <TableCell>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!row.hasNumber || isTesting}
          onClick={() => startTest(async () => setTestResult(await testCounsellorNumber(row.id)))}
        >
          {isTesting ? "Testing…" : "Test"}
        </Button>
        {testResult && (
          <p className={`mt-1 text-xs ${testResult.ok ? "text-emerald-600" : "text-destructive"}`}>{testResult.message}</p>
        )}
      </TableCell>
    </TableRow>
  );
}

export function CounsellorNumbersTable({ rows }: { rows: CounsellorNumberRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No one currently holds the &quot;Send WhatsApp messages&quot; permission.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Counsellor</TableHead>
          <TableHead>Number</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Connection</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <CounsellorRow key={row.id} row={row} />
        ))}
      </TableBody>
    </Table>
  );
}
