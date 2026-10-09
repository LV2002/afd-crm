import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { OptionBadge } from "@/components/ui/option-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { droppedLeadIds } from "@/lib/enrolment/dropped-leads";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import {
  OPTION_BEARING_TYPES,
  getDropdownOptions,
  resolveFieldOptions,
  type FieldOption,
} from "@/lib/fields/resolve-field-options";
import { mergeUserRefLabels } from "@/lib/fields/user-ref-labels";
import { formatDateIST, startOfDayIST, startOfTomorrowIST } from "@/lib/format/date";
import { filterTerm } from "@/lib/db/filter-term";
import { applyLeadFilters, readFilterValues } from "@/lib/leads/apply-filters";
import { recentMonths } from "@/lib/leads/date-filters";
import {
  FOLLOWUP_BUCKETS,
  FOLLOWUP_BUCKET_LABEL,
  FOLLOWUP_BUCKET_NOTE,
  boundariesFrom,
  bucketFor,
  type FollowupBucket,
} from "@/lib/leads/followup-buckets";
import { maskPhone } from "@/lib/leads/mask-phone";
import { DEAD_TEMPERATURE } from "@/lib/leads/no-longer-worked";
import { batchNameLookup } from "@/lib/leads/batch-name-lookup";
import { createClient } from "@/lib/supabase/server";
import { formatTerm } from "@/lib/terminology/terms";
import { getTerminologyMap } from "@/lib/terminology/get-terminology";

import { LeadFilters, type FilterFieldWithOptions } from "../leads/lead-filters";
import { FollowupScope } from "./followup-scope";

/**
 * **Follow-ups** — who a counsellor owes a call, soonest first.
 *
 * This replaced the Pipeline board, which Leon did not use. A kanban
 * answers "where is everybody in the funnel", which is a manager's
 * question asked once a week; a counsellor's question is "who am I
 * behind on this morning", and the board could not answer it at all —
 * the follow-up date was a line of small text on a card in whichever
 * column the lead happened to sit.
 *
 * ## Why not just the leads list
 *
 * The leads list can filter to overdue follow-ups, and does. What it
 * cannot do is be about them: it sorts newest-first, because the
 * question it answers is "what has come in". Sorting by a date nobody
 * can see, grouped into piles nobody asked for, would make it worse at
 * its own job. So this is a second view of the same rows with the
 * opposite ordering and its own shape, sharing every filter control
 * rather than growing a parallel set.
 *
 * ## What is deliberately not here
 *
 * Leads with no follow-up booked. A screen whose whole purpose is a
 * dated queue would be swamped by them — most of the database, in date
 * order by a date that does not exist. The leads list answers that with
 * its own `followup=none` filter, and the empty state here says so.
 *
 * Tasks are also absent. A task has its own due date and its own screen;
 * folding both into one list means two things called "due" that behave
 * differently, and the dashboard queue already merges them for the one
 * place that wants them merged.
 */

const PAGE_SIZE = 50;

function asParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

interface FollowupRow {
  id: string;
  lead_number: number;
  student_name: string;
  primary_phone: string;
  next_followup_at: string;
  stage_id: string | null;
  temperature: string | null;
  center_id: string | null;
  assigned_to: string | null;
}

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  const params = await searchParams;
  const terms = await getTerminologyMap();
  const leadPlural = formatTerm(terms, "lead", "plural").toLowerCase();

  const supabase = await createClient();
  const fields = await getFieldSchema(supabase, "lead", user);

  const search = asParam(params.search) ?? "";
  /*
    Whose follow-ups.

    Defaults to the signed-in person's own, which is the whole point of
    the screen: a counsellor opening it wants their morning, not the
    institute's. A centre head or admin can see everybody's — RLS
    already decides what "everybody" means for them — but only by
    asking, because a list of fifty other people's calls is not a work
    queue, it is a report.

    A counsellor sees no switch at all: for them the two scopes return
    the same rows, so offering the choice would be offering nothing.
  */
  const seesOthers = can(user, "lead.assign");
  const scope = asParam(params.scope) === "all" && seesOthers ? "all" : "mine";

  const filterableFields = fields.filter((field) => field.showInFilters);
  const optionBearingFields = fields.filter((field) => OPTION_BEARING_TYPES.has(field.type));
  const optionEntries = await Promise.all(
    optionBearingFields.map(
      async (field) => [field.key, await resolveFieldOptions(supabase, field)] as const,
    ),
  );
  const optionsByKey: Record<string, FieldOption[]> = Object.fromEntries(optionEntries);
  const filterValues = readFilterValues(params, filterableFields);

  const now = new Date();
  const bounds = boundariesFrom(startOfDayIST(now), startOfTomorrowIST(now));

  /*
    Won, lost and Dead are left out, and this is the same judgement the
    "overdue" filter on the leads list makes — see date-filters.ts. A
    student who enrolled in March still carries the follow-up date
    somebody booked in February, and a catch-up list that opens with
    twenty of them is not a catch-up list. Nor is one that keeps asking
    about somebody the counsellor has already marked Dead.
  */
  const { data: terminalStages } = await supabase
    .from("pipeline_stages")
    .select("id")
    .in("stage_type", ["won", "lost"])
    .returns<Array<{ id: string }>>();
  const terminalIds = (terminalStages ?? []).map((stage) => stage.id);

  let query = supabase
    .from("leads")
    .select(
      "id, lead_number, student_name, primary_phone, next_followup_at, stage_id, temperature, center_id, assigned_to",
      { count: "exact" },
    )
    .is("deleted_at", null);

  // Reassigned rather than chained from the builder above: every link in
  // one chain is a fresh generic instantiation, and past a handful of
  // them TypeScript gives up with "type instantiation is excessively
  // deep". The leads list has the same shape for the same reason.
  query = query.not("next_followup_at", "is", null);
  query = applyLeadFilters(query, filterableFields, filterValues);
  if (scope === "mine") query = query.eq("assigned_to", user.id);
  if (terminalIds.length > 0) {
    query = query.not("stage_id", "in", `(${terminalIds.join(",")})`);
  }
  query = query.or(`temperature.is.null,temperature.neq.${DEAD_TEMPERATURE}`);

  const searchFilter = filterTerm(search);
  if (searchFilter) {
    query = query.or(
      `student_name.ilike.%${searchFilter}%,primary_phone.ilike.%${searchFilter}%`,
    );
  }

  const page = Math.max(1, Number(asParam(params.page) ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;

  const {
    data: rows,
    count,
    error,
  } = await query
    // The ordering this screen exists for: the longest-overdue first,
    // and nothing else as a tiebreak but the lead's own number, so two
    // calls booked for the same minute keep a stable order between
    // refreshes rather than swapping places.
    .order("next_followup_at", { ascending: true })
    .order("lead_number", { ascending: true })
    .range(from, from + PAGE_SIZE - 1)
    .returns<FollowupRow[]>();

  if (error) throw new Error(`Failed to load follow-ups: ${error.message}`);

  const list = rows ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [stageOptions, temperatureOptions, optionsWithUsers, centerNames, dropped] =
    await Promise.all([
      stageOptionsFor(supabase),
      getDropdownOptions(supabase, "temperature"),
      // Names for whoever these rows are assigned to, which is not the
      // same set as "who may a lead be assigned to" — a lead owned by a
      // deactivated counsellor still has to say who owns it.
      mergeUserRefLabels(
        supabase,
        fields,
        list as unknown as Array<Record<string, unknown>>,
        optionsByKey,
      ),
      batchNameLookup(
        supabase,
        "centers",
        "name",
        Array.from(new Set(list.map((row) => row.center_id).filter(Boolean))) as string[],
      ),
      droppedLeadIds(supabase, list.map((row) => row.id)),
    ]);

  const stageByValue = new Map(stageOptions.map((option) => [option.value, option]));
  const temperatureByValue = new Map(temperatureOptions.map((option) => [option.value, option]));
  const assigneeByValue = new Map(
    (optionsWithUsers.assigned_to ?? []).map((option) => [option.value, option] as const),
  );

  // Grouped after the ordered fetch rather than by five separate
  // queries: the rows are already in the right order, so the grouping is
  // a single pass that cannot disagree with the ordering it came from.
  const grouped = new Map<FollowupBucket, FollowupRow[]>();
  for (const row of list) {
    const bucket = bucketFor(new Date(row.next_followup_at), bounds);
    const existing = grouped.get(bucket);
    if (existing) existing.push(row);
    else grouped.set(bucket, [row]);
  }

  const filterFieldsWithOptions: FilterFieldWithOptions[] = filterableFields.map((field) => ({
    field,
    options: optionsByKey[field.key] ?? [],
  }));

  const hasAnyFilter =
    Boolean(search) || Object.keys(filterValues).length > 0 || scope === "all";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Follow-ups</h1>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? `No ${leadPlural} waiting on a call.`
              : `${total} ${total === 1 ? "call" : "calls"} booked, soonest first.`}
          </p>
        </div>
        {seesOthers && <FollowupScope scope={scope} />}
      </div>

      <LeadFilters
        filterFields={filterFieldsWithOptions}
        searchValue={search}
        months={recentMonths(now)}
      />

      {list.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={hasAnyFilter ? "Nothing matches those filters" : "Nothing booked"}
        >
          {hasAnyFilter ? (
            "Clear a filter to see the rest."
          ) : (
            <>
              Booking a follow-up date on a{" "}
              {formatTerm(terms, "lead", "singular").toLowerCase()} puts it here. To find the ones
              with no date booked at all, open{" "}
              <Link href="/leads?followup=none" className="font-medium underline">
                the {leadPlural} list
              </Link>{" "}
              — that is the question this screen deliberately cannot answer.
            </>
          )}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {FOLLOWUP_BUCKETS.filter((bucket) => grouped.has(bucket)).map((bucket) => {
            const bucketRows = grouped.get(bucket) ?? [];
            return (
              <section key={bucket} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="text-sm font-semibold">
                    {FOLLOWUP_BUCKET_LABEL[bucket]}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {bucketRows.length}
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground">{FOLLOWUP_BUCKET_NOTE[bucket]}</p>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Due</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Temperature</TableHead>
                        <TableHead>Centre</TableHead>
                        {scope === "all" && <TableHead>Owner</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bucketRows.map((row) => {
                        const stage = row.stage_id ? stageByValue.get(row.stage_id) : undefined;
                        const temperature = row.temperature
                          ? temperatureByValue.get(row.temperature)
                          : undefined;
                        const owner = row.assigned_to
                          ? assigneeByValue.get(row.assigned_to)
                          : undefined;
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {formatDateIST(row.next_followup_at, "d MMM, h:mm a")}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/leads/${row.id}`}
                                className="font-medium hover:underline"
                              >
                                {row.student_name}
                              </Link>
                              {dropped.has(row.id) && (
                                <Badge variant="secondary" className="ml-2">
                                  Dropped
                                </Badge>
                              )}
                            </TableCell>
                            {/* Masked, like every other list — non-negotiable #6.
                                The full number is one click away on the lead. */}
                            <TableCell className="whitespace-nowrap font-mono text-xs">
                              {maskPhone(row.primary_phone)}
                            </TableCell>
                            <TableCell>
                              {stage ? <OptionBadge option={stage} /> : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              {temperature ? (
                                <OptionBadge option={temperature} />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.center_id ? (centerNames.get(row.center_id) ?? "—") : "—"}
                            </TableCell>
                            {scope === "all" && (
                              <TableCell className="text-sm text-muted-foreground">
                                {owner?.label ?? "Unassigned"}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(params, page - 1)} className="font-medium hover:underline">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(params, page + 1)} className="font-medium hover:underline">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function pageHref(
  params: Record<string, string | string[] | undefined>,
  target: number,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && key !== "page") next.set(key, value);
  }
  next.set("page", String(target));
  return `/follow-ups?${next.toString()}`;
}

/**
 * Stages as badge options, with the admin's own colours.
 *
 * `pipeline_stages` is not a `dropdown_options` category, so the generic
 * option resolver does not reach it — which is why this is three lines
 * here rather than one call.
 */
async function stageOptionsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<FieldOption[]> {
  const { data } = await supabase
    .from("pipeline_stages")
    .select("id, name, color")
    .eq("is_active", true)
    .order("sort_order")
    .returns<Array<{ id: string; name: string; color: string | null }>>();
  return (data ?? []).map((stage) => ({
    value: stage.id,
    label: stage.name,
    color: stage.color,
  }));
}
