import Link from "next/link";
import { Plus } from "lucide-react";

import { AccessDenied } from "@/components/layout/access-denied";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { fieldColumn, getRawFieldValue } from "@/lib/fields/field-column";
import { formatFieldValue } from "@/lib/fields/format-field-value";
import { getFieldSchema, type FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import {
  OPTION_BEARING_TYPES,
  resolveFieldOptions,
  type FieldOption,
} from "@/lib/fields/resolve-field-options";
import { applyLeadFilters, readFilterValues } from "@/lib/leads/apply-filters";
import { createClient } from "@/lib/supabase/server";
import { formatTerm } from "@/lib/terminology/terms";
import { getTerminologyMap } from "@/lib/terminology/get-terminology";

import { ExportButton } from "./export-button";
import { LeadFilters, type FilterFieldWithOptions } from "./lead-filters";
import { RevealPhoneButton } from "./reveal-phone-button";

const PAGE_SIZE = 25;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  const params = await searchParams;
  const terms = await getTerminologyMap();
  const leadPlural = formatTerm(terms, "lead", "plural");

  const supabase = await createClient();
  const fields = await getFieldSchema(supabase, "lead", user);
  const listFields = fields.filter((f) => f.showInList);
  const filterableFields = fields.filter((f) => f.showInFilters);
  const canRevealPhone = can(user, "lead.reveal_phone");

  const optionsByKey: Record<string, FieldOption[]> = {};
  for (const field of fields) {
    if (OPTION_BEARING_TYPES.has(field.type)) {
      optionsByKey[field.key] = await resolveFieldOptions(supabase, field);
    }
  }
  const filterFieldsWithOptions: FilterFieldWithOptions[] = filterableFields.map((field) => ({
    field,
    options: optionsByKey[field.key] ?? [],
  }));

  const search = typeof params.search === "string" ? params.search : "";
  const filterValues = readFilterValues(params, filterableFields);
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // A core field is a real leads column; a non-core (custom) field's value
  // lives inside the `custom` jsonb blob instead — select that once rather
  // than trying to select a column named after the custom key, which
  // doesn't exist (see src/lib/fields/field-column.ts).
  const coreListColumns = listFields.filter((f) => f.isCore).map((f) => fieldColumn(f.key));
  const needsCustomColumn = listFields.some((f) => !f.isCore);
  const selectColumns = Array.from(
    new Set([
      "id",
      "primary_phone",
      ...coreListColumns,
      ...(needsCustomColumn ? ["custom"] : []),
    ]),
  ).join(", ");

  let query = supabase
    .from("leads")
    .select(selectColumns, { count: "exact" })
    .is("deleted_at", null);
  query = applyLeadFilters(query, filterableFields, filterValues);
  if (search) {
    query = query.or(`student_name.ilike.%${search}%,primary_phone.ilike.%${search}%`);
  }

  const {
    data: rows,
    count,
    error,
  } = await query
    .order("created_at", { ascending: false })
    .range(from, to)
    .returns<Array<Record<string, unknown>>>();

  if (error) {
    throw new Error(`Failed to load ${leadPlural.toLowerCase()}: ${error.message}`);
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(target: number) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && key !== "page") next.set(key, value);
    }
    next.set("page", String(target));
    return `/leads?${next.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{leadPlural}</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? leadPlural.toLowerCase().replace(/s$/, "") : leadPlural.toLowerCase()}
          </p>
        </div>
        <div className="flex gap-2">
          {can(user, "lead.create") && (
            <Button asChild size="sm">
              <Link href="/leads/new">
                <Plus /> New {leadPlural.toLowerCase().replace(/s$/, "")}
              </Link>
            </Button>
          )}
          {can(user, "lead.export") && <ExportButton filterValues={filterValues} />}
        </div>
      </div>

      <LeadFilters filterFields={filterFieldsWithOptions} searchValue={search} />

      <Table>
        <TableHeader>
          <TableRow>
            {listFields.map((field) => (
              <TableHead key={field.id}>{field.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).map((row) => (
            <TableRow key={String(row.id)}>
              {listFields.map((field) => (
                <TableCell key={field.id}>
                  {renderCell(field, row, optionsByKey, canRevealPhone)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {(rows ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={listFields.length} className="text-center text-muted-foreground">
                No {leadPlural.toLowerCase()} match these filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
              {page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <span>Previous</span>}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} asChild={page < totalPages}>
              {page < totalPages ? <Link href={pageHref(page + 1)}>Next</Link> : <span>Next</span>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderCell(
  field: FieldSchemaEntry,
  row: Record<string, unknown>,
  optionsByKey: Record<string, FieldOption[]>,
  canRevealPhone: boolean,
) {
  const value = getRawFieldValue(field, row);

  if (field.isCore && field.key === "student_name") {
    return (
      <Link href={`/leads/${row.id}`} className="font-medium hover:underline">
        {String(value ?? "—")}
      </Link>
    );
  }

  if (field.type === "phone") {
    return (
      <RevealPhoneButton
        leadId={String(row.id)}
        masked={value as string | null}
        canReveal={canRevealPhone}
      />
    );
  }

  return formatFieldValue(field, value, optionsByKey);
}
