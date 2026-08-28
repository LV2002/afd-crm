"use client";

import Papa from "papaparse";
import { useMemo, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import type { FieldOption } from "@/lib/fields/resolve-field-options";
import { suggestColumnMapping } from "@/lib/leads/suggest-column-mapping";

import { importLeads, type ImportMapping, type ImportRow, type ImportSummary } from "./actions";

type Step = "upload" | "map" | "preview" | "results";

const REQUIRED_KEYS = ["student_name", "primary_phone"];
const PREVIEW_ROW_COUNT = 5;

export function ImportWizard({ fields, centers }: { fields: FieldSchemaEntry[]; centers: FieldOption[] }) {
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [defaultCenterId, setDefaultCenterId] = useState<string>("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const mappedKeys = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);
  const hasRequiredMapping = REQUIRED_KEYS.every((k) => mappedKeys.has(k));

  function handleFile(file: File) {
    setFileError(null);
    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const detectedHeaders = results.meta.fields ?? [];
        if (detectedHeaders.length === 0 || results.data.length === 0) {
          setFileError("Couldn't find any columns or rows in that file.");
          return;
        }
        const initialMapping: ImportMapping = {};
        for (const h of detectedHeaders) initialMapping[h] = suggestColumnMapping(h, fields);
        setHeaders(detectedHeaders);
        setRows(results.data);
        setMapping(initialMapping);
        setStep("map");
      },
      error: (err) => setFileError(err.message),
    });
  }

  function fieldOptionsFor(header: string): FieldSchemaEntry[] {
    const takenByOthers = new Set(
      Object.entries(mapping)
        .filter(([h, key]) => h !== header && key !== "")
        .map(([, key]) => key),
    );
    return fields.filter((f) => !takenByOthers.has(f.key));
  }

  function runImport() {
    setImportError(null);
    startTransition(async () => {
      const result = await importLeads(rows, mapping, defaultCenterId || null);
      if (result.error) {
        setImportError(result.error);
        return;
      }
      setSummary(result.summary ?? null);
      setStep("results");
    });
  }

  function startOver() {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setDefaultCenterId("");
    setSummary(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (step === "upload") {
    return (
      <div className="flex max-w-xl flex-col gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="rounded-md border border-dashed p-6 text-sm"
        />
        {fileError && <p className="text-sm text-destructive">{fileError}</p>}
      </div>
    );
  }

  if (step === "map") {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Map each column to a field, or leave it as Skip.</p>
          <div className="flex flex-col divide-y rounded-md border">
            {headers.map((header) => (
              <div key={header} className="flex items-center gap-3 p-3">
                <span className="w-48 shrink-0 truncate text-sm font-medium" title={header}>
                  {header}
                </span>
                <Select
                  value={mapping[header] || "__skip__"}
                  onValueChange={(value) =>
                    setMapping((m) => ({ ...m, [header]: value === "__skip__" ? "" : value }))
                  }
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip__">Skip this column</SelectItem>
                    {fieldOptionsFor(header).map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                        {REQUIRED_KEYS.includes(f.key) ? " *" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {REQUIRED_KEYS.map((key) => (
            <Badge key={key} variant={mappedKeys.has(key) ? "secondary" : "destructive"}>
              {fieldByKey.get(key)?.label ?? key}: {mappedKeys.has(key) ? "mapped" : "required"}
            </Badge>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            Default centre {mappedKeys.has("center_id") && "(used only for rows where Centre doesn't map)"}
          </p>
          <Select value={defaultCenterId} onValueChange={setDefaultCenterId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Choose a centre" />
            </SelectTrigger>
            <SelectContent>
              {centers.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={startOver}>
            Start over
          </Button>
          <Button disabled={!hasRequiredMapping} onClick={() => setStep("preview")}>
            Next: Preview
          </Button>
        </div>
      </div>
    );
  }

  if (step === "preview") {
    const mappedHeaders = headers.filter((h) => mapping[h]);
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {rows.length} row{rows.length === 1 ? "" : "s"} will be processed. Showing the first{" "}
          {Math.min(PREVIEW_ROW_COUNT, rows.length)}.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {mappedHeaders.map((h) => (
                  <TableHead key={h}>{fieldByKey.get(mapping[h])?.label ?? h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, PREVIEW_ROW_COUNT).map((row, i) => (
                <TableRow key={i}>
                  {mappedHeaders.map((h) => (
                    <TableCell key={h}>{row[h] || "—"}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {importError && <p className="text-sm text-destructive">{importError}</p>}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep("map")}>
            Back to mapping
          </Button>
          <Button disabled={isPending} onClick={runImport}>
            {isPending ? "Importing…" : `Import ${rows.length} row${rows.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    );
  }

  // step === "results"
  if (!summary) return null;
  const problemRows = summary.rows.filter((r) => r.status === "skipped" || r.message);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge>{summary.total} total</Badge>
        <Badge variant="secondary">{summary.created} new leads created</Badge>
        <Badge variant="secondary">{summary.matched} matched an existing lead</Badge>
        {summary.skipped > 0 && <Badge variant="destructive">{summary.skipped} skipped</Badge>}
      </div>

      {problemRows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {problemRows.map((r) => (
                <TableRow key={r.rowIndex}>
                  <TableCell>{r.rowIndex}</TableCell>
                  <TableCell className="capitalize">{r.status}</TableCell>
                  <TableCell className="text-muted-foreground">{r.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Button onClick={startOver} className="w-fit">
        Import another file
      </Button>
    </div>
  );
}
