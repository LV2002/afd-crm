"use client";

import { Plus, X } from "lucide-react";
import * as React from "react";

import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Condition, ConditionField, ConditionOp } from "@/lib/assignment/evaluate-conditions";
import {
  CONDITION_FIELDS,
  MULTI_VALUE_OPS,
  OP_LABELS,
  VALUELESS_OPS,
  opsFor,
} from "@/lib/rules/condition-fields";
import { describeCondition } from "@/lib/rules/describe-rule";

/**
 * Building a rule condition without writing JSON.
 *
 * Both rule tables in this system — assignment and temperature — store
 * `{"all": [...]}` and are read by the same evaluator, and until now both
 * settings screens showed a textarea containing that JSON. That is a
 * screen only its author can use, which makes the whole "configuration is
 * data" promise (CLAUDE.md § 10) hollow: a rule an admin cannot edit might
 * as well be hardcoded.
 *
 * The control posts one hidden input containing the JSON, so it drops into
 * the `<form action={serverAction}>` pattern every other form here uses.
 * The server re-validates it (`parse-rule.ts`) — a hidden input is a
 * request body like any other.
 *
 * ## Why the operator list changes with the field
 *
 * `interested_exams` is a Postgres text[], and the evaluator's `equals`
 * is `===`, so "interested exams equals NIFT" is a rule that matches
 * nothing, forever, silently. The offered operators come from `opsFor()`,
 * which knows that. A person cannot build the broken rule.
 */

export interface ConditionFieldOptions {
  /** Known values for a field, where it has any. */
  [field: string]: Array<{ value: string; label: string }>;
}

interface Row {
  /** Local only — React keys must survive reordering and deletion. */
  uid: string;
  field: ConditionField;
  op: ConditionOp;
  value: unknown;
}

let counter = 0;
function nextUid(): string {
  counter += 1;
  return `condition-${counter}`;
}

export function ConditionBuilder({
  name = "conditions",
  defaultConditions = [],
  optionsByField = {},
  fields,
}: {
  name?: string;
  defaultConditions?: Condition[];
  optionsByField?: ConditionFieldOptions;
  /** Which fields to offer. Defaults to every field the evaluator whitelists. */
  fields: ConditionField[];
}) {
  const [rows, setRows] = React.useState<Row[]>(() =>
    defaultConditions.map((condition) => ({
      uid: nextUid(),
      field: condition.field,
      op: condition.op,
      value: condition.value ?? "",
    })),
  );

  const payload = JSON.stringify({
    all: rows.map((row) =>
      VALUELESS_OPS.includes(row.op)
        ? { field: row.field, op: row.op }
        : { field: row.field, op: row.op, value: row.value },
    ),
  });

  const label = React.useCallback(
    (_kind: "center" | "user" | "option", value: string) => {
      for (const options of Object.values(optionsByField)) {
        const hit = options.find((option) => option.value === value);
        if (hit) return hit.label;
      }
      return value;
    },
    [optionsByField],
  );

  function update(uid: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.uid === uid ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const field = fields[0];
    setRows((current) => [...current, { uid: nextUid(), field, op: opsFor(field)[0], value: "" }]);
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={payload} readOnly />

      {rows.length === 0 && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No conditions — this rule matches <strong>every</strong> lead. That is useful as the
          last rule in the list, as a catch-all, and a mistake anywhere else.
        </p>
      )}

      {rows.map((row, index) => {
        const meta = CONDITION_FIELDS[row.field];
        const options = optionsByField[row.field] ?? [];
        const ops = opsFor(row.field);

        return (
          <div key={row.uid} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-10 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                {index === 0 ? "Where" : "and"}
              </span>

              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
                <Combobox
                  options={fields.map((field) => ({
                    value: field,
                    label: CONDITION_FIELDS[field].label,
                  }))}
                  value={row.field}
                  onChange={(value) => {
                    const field = value as ConditionField;
                    const allowed = opsFor(field);
                    // Changing the field can strand the operator — "is
                    // between" makes no sense on a source. Keep it when it
                    // is still offered, fall back to the first when not.
                    update(row.uid, {
                      field,
                      op: allowed.includes(row.op) ? row.op : allowed[0],
                      value: "",
                    });
                  }}
                  aria-label="Field"
                />

                <Combobox
                  options={ops.map((op) => ({ value: op, label: OP_LABELS[op] }))}
                  value={row.op}
                  onChange={(value) => {
                    const op = value as ConditionOp;
                    const wasList = MULTI_VALUE_OPS.includes(row.op) || row.op === "between";
                    const isList = MULTI_VALUE_OPS.includes(op) || op === "between";
                    update(row.uid, { op, value: wasList === isList ? row.value : isList ? [] : "" });
                  }}
                  aria-label="Operator"
                />

                <ValueControl row={row} options={options} onChange={(value) => update(row.uid, { value })} />
              </div>

              <button
                type="button"
                onClick={() => setRows((current) => current.filter((r) => r.uid !== row.uid))}
                aria-label="Remove this condition"
                className="mt-1 shrink-0 rounded p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {meta.hint && <p className="pl-12 text-xs text-muted-foreground">{meta.hint}</p>}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"
        >
          <Plus className="size-4" />
          Add a condition
        </button>
        {rows.length > 1 && (
          <p className="text-xs text-muted-foreground">
            All of them have to be true — there is no &ldquo;or&rdquo;.
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <p className="rounded-md bg-muted p-3 text-sm">
          <span className="text-muted-foreground">In words: </span>
          {rows
            .map((row) =>
              describeCondition({ field: row.field, op: row.op, value: row.value }, label),
            )
            .join(", and ")}
        </p>
      )}
    </div>
  );
}

function ValueControl({
  row,
  options,
  onChange,
}: {
  row: Row;
  options: Array<{ value: string; label: string }>;
  onChange: (value: unknown) => void;
}) {
  const meta = CONDITION_FIELDS[row.field];

  if (VALUELESS_OPS.includes(row.op)) {
    return <p className="self-center text-sm text-muted-foreground">no value needed</p>;
  }

  if (row.op === "between") {
    const pair = Array.isArray(row.value) ? (row.value as unknown[]) : [];
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={String(pair[0] ?? "")}
          onChange={(event) => onChange([event.target.value, pair[1] ?? ""])}
          aria-label="From"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="number"
          value={String(pair[1] ?? "")}
          onChange={(event) => onChange([pair[0] ?? "", event.target.value])}
          aria-label="To"
        />
      </div>
    );
  }

  if (MULTI_VALUE_OPS.includes(row.op)) {
    const chosen = Array.isArray(row.value) ? (row.value as string[]) : [];

    // Known values get tick boxes; a free-text field gets one box and
    // splits on commas, which is the only sane way to type a list of
    // cities nobody has enumerated.
    if (options.length > 0) {
      return (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2 sm:col-span-1">
          {options.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={chosen.includes(option.value)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked
                      ? [...chosen, option.value]
                      : chosen.filter((value) => value !== option.value),
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }

    return (
      <Input
        value={chosen.join(", ")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean),
          )
        }
        placeholder="Separate with commas"
        aria-label="Values"
      />
    );
  }

  if (options.length > 0 && meta.input === "options") {
    return (
      <Combobox
        options={options}
        value={typeof row.value === "string" ? row.value : ""}
        onChange={onChange}
        placeholder="Choose a value"
        aria-label="Value"
      />
    );
  }

  return (
    <Input
      type={meta.input === "number" ? "number" : "text"}
      value={typeof row.value === "string" || typeof row.value === "number" ? String(row.value) : ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Value"
      aria-label="Value"
    />
  );
}
