"use client";

import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import { suggestColumnMapping } from "@/lib/leads/suggest-column-mapping";

import { importContacts, type ContactImportResult, type ImportMapping, type ImportRow } from "../actions";

type Step = "upload" | "map" | "preview" | "importing" | "results";

const CHUNK = 1000;
const PREVIEW_ROWS = 5;

interface Totals {
  total: number;
  created: number;
  existing: number;
  alreadyOnList: number;
  skipped: number;
  alreadyLeads: number;
  problems: Array<{ rowIndex: number; message: string }>;
}
const ZERO: Totals = { total: 0, created: 0, existing: 0, alreadyOnList: 0, skipped: 0, alreadyLeads: 0, problems: [] };

export function ImportWizard({
  fields,
  lists,
}: {
  fields: FieldSchemaEntry[];
  lists: Array<{ id: string; name: string }>;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [listId, setListId] = useState(lists.length === 1 ? lists[0].id : "");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [totals, setTotals] = useState<Totals>(ZERO);
  const fileRef = useRef<HTMLInputElement>(null);

  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const mappedKeys = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);
  const canContinue = mappedKeys.has("student_name") && (mappedKeys.has("primary_phone") || mappedKeys.has("email"));

  function handleFile(file: File) {
    setFileError(null);
    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const found = results.meta.fields ?? [];
        if (found.length === 0 || results.data.length === 0) {
          setFileError("Couldn't find any columns or rows in that file.");
          return;
        }
        const initial: ImportMapping = {};
        for (const h of found) initial[h] = suggestColumnMapping(h, fields);
        setHeaders(found);
        setRows(results.data);
        setMapping(initial);
        setStep("map");
      },
      error: (err) => setFileError(err.message),
    });
  }

  function optionsFor(header: string): FieldSchemaEntry[] {
    const taken = new Set(Object.entries(mapping).filter(([h, k]) => h !== header && k !== "").map(([, k]) => k));
    return fields.filter((f) => !taken.has(f.key));
  }

  async function run() {
    setImportError(null);
    setTotals(ZERO);
    setDone(0);
    setStep("importing");
    let acc: Totals = { ...ZERO, problems: [] };
    for (let offset = 0; offset < rows.length; offset += CHUNK) {
      const result: ContactImportResult = await importContacts(rows.slice(offset, offset + CHUNK), mapping, listId, offset);
      if (result.error) {
        setImportError(`${result.error}${offset > 0 ? ` The first ${offset} rows were saved; start over to continue from the file.` : ""}`);
        setTotals(acc);
        setStep("results");
        return;
      }
      acc = {
        total: acc.total + result.total,
        created: acc.created + result.created,
        existing: acc.existing + result.existing,
        alreadyOnList: acc.alreadyOnList + result.alreadyOnList,
        skipped: acc.skipped + result.skipped,
        alreadyLeads: acc.alreadyLeads + result.alreadyLeads,
        problems: [...acc.problems, ...result.problems],
      };
      setDone(Math.min(rows.length, offset + CHUNK));
    }
    setTotals(acc);
    setStep("results");
  }

  function startOver() {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setFileError(null);
    setImportError(null);
    setTotals(ZERO);
    if (fileRef.current) fileRef.current.value = "";
  }

  const listPicker = (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="import-list" className="text-sm font-medium">
        Put these people on
      </label>
      <select
        id="import-list"
        value={listId}
        onChange={(e) => setListId(e.target.value)}
        className="h-10 w-72 rounded-md border border-input bg-card px-3 text-sm"
      >
        {lists.length !== 1 && <option value="">Choose a list…</option>}
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );

  if (step === "upload") {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        {listPicker}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          disabled={!listId}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="rounded-md border border-dashed p-6 text-sm disabled:opacity-50"
        />
        {!listId && <p className="text-sm text-muted-foreground">Choose the list first.</p>}
        {fileError && <p className="text-sm text-destructive">{fileError}</p>}
      </div>
    );
  }

  if (step === "map") {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <p className="text-sm font-medium">Map each column to a field, or leave it as Skip.</p>
        <div className="flex flex-col divide-y rounded-md border">
          {headers.map((header) => (
            <div key={header} className="flex items-center gap-3 p-3">
              <span className="w-48 shrink-0 truncate text-sm font-medium" title={header}>
                {header}
              </span>
              <Combobox
                className="w-64"
                value={mapping[header] || "__skip__"}
                onChange={(value) => setMapping((m) => ({ ...m, [header]: value === "__skip__" ? "" : value }))}
                options={[
                  { value: "__skip__", label: "Skip this column" },
                  ...optionsFor(header).map((f) => ({ value: f.key, label: f.label })),
                ]}
                searchPlaceholder="Type a field name…"
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant={mappedKeys.has("student_name") ? "secondary" : "destructive"}>
            Name: {mappedKeys.has("student_name") ? "mapped" : "required"}
          </Badge>
          <Badge variant={mappedKeys.has("primary_phone") || mappedKeys.has("email") ? "secondary" : "destructive"}>
            Phone or email: {mappedKeys.has("primary_phone") || mappedKeys.has("email") ? "mapped" : "required"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={startOver}>
            Start over
          </Button>
          <Button disabled={!canContinue} onClick={() => setStep("preview")}>
            Next: Preview
          </Button>
        </div>
      </div>
    );
  }

  if (step === "preview") {
    const shown = headers.filter((h) => mapping[h]);
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {rows.length.toLocaleString("en-IN")} row{rows.length === 1 ? "" : "s"} will go on{" "}
          <strong className="text-foreground">{lists.find((l) => l.id === listId)?.name}</strong>. Showing the first{" "}
          {Math.min(PREVIEW_ROWS, rows.length)}.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {shown.map((h) => (
                  <TableHead key={h}>{fieldByKey.get(mapping[h])?.label ?? h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                <TableRow key={i}>
                  {shown.map((h) => (
                    <TableCell key={h}>{row[h] || "—"}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep("map")}>
            Back to mapping
          </Button>
          <Button onClick={run}>Import {rows.length.toLocaleString("en-IN")} rows</Button>
        </div>
      </div>
    );
  }

  if (step === "importing") {
    return (
      <div className="flex max-w-md flex-col gap-3">
        <p className="text-sm">
          Importing… {done.toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")}
        </p>
        <div className="h-2 overflow-hidden rounded bg-muted">
          <div className="h-full bg-foreground transition-all" style={{ width: `${Math.round((done / rows.length) * 100)}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">Keep this page open until it finishes.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {importError && <p className="text-sm text-destructive">{importError}</p>}
      <div className="flex flex-wrap gap-2">
        <Badge>{totals.total.toLocaleString("en-IN")} rows</Badge>
        <Badge variant="secondary">{totals.created.toLocaleString("en-IN")} new people</Badge>
        {totals.existing > 0 && <Badge variant="secondary">{totals.existing} already in the database, added to this list</Badge>}
        {totals.alreadyOnList > 0 && <Badge variant="secondary">{totals.alreadyOnList} already on this list</Badge>}
        {totals.alreadyLeads > 0 && <Badge variant="outline">{totals.alreadyLeads} are already leads (you can merge them)</Badge>}
        {totals.skipped > 0 && <Badge variant="destructive">{totals.skipped} skipped</Badge>}
      </div>
      {totals.problems.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                <TableHead>Why it was skipped</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totals.problems.slice(0, 200).map((p) => (
                <TableRow key={p.rowIndex}>
                  <TableCell>{p.rowIndex}</TableCell>
                  <TableCell className="text-muted-foreground">{p.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={startOver}>Import another file</Button>
      </div>
    </div>
  );
}
