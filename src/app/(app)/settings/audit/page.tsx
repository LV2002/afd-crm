import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getCurrentUser, scopeFor } from "@/lib/auth/session";
import {
  auditEntityHref,
  auditPayloadLines,
  describeAuditAction,
  describeEntityType,
} from "@/lib/audit/describe-entry";
import { formatDateIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";

import { AuditEntry, type AuditEntryData } from "./audit-entry";
import { loadAuditFacets } from "./facets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PAGE_SIZE = 50;

interface AuditRecord {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  occurred_at: string;
  profiles: { full_name: string } | null;
}

/**
 * The audit log, readable.
 *
 * Every mutation and every export in this system has written a row here
 * since Phase 1 (CLAUDE.md § 5) and nothing has ever displayed one. A
 * trail nobody can read does not deter anything and does not answer any
 * question — which is the whole reason for keeping it, in a business where
 * a counsellor leaving with a copy of the database is the named risk.
 *
 * Admin only, and enforced twice: this gate, and the RLS policy migration
 * 0066 tightened to `auth_scope('audit.read') = 'all'`. The gate is
 * checked against the scope rather than mere possession of the
 * permission, so the screen and the database agree about who gets in.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string; what?: string; entity?: string; from?: string; to?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || scopeFor(user, "audit.read") !== "all") return <AccessDenied />;

  const params = await searchParams;
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const supabase = await createClient();

  let query = supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, before, after, occurred_at, profiles(full_name)", {
      count: "exact",
    })
    .order("occurred_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (params.who) query = query.eq("actor_id", params.who);
  if (params.entity) query = query.eq("entity_type", params.entity);
  // `what` filters on the action's subject — "lead", "payment" — which is
  // the half of the code somebody actually thinks in.
  if (params.what) query = query.like("action", `${params.what}.%`);
  if (params.from) query = query.gte("occurred_at", istDayStart(params.from));
  if (params.to) query = query.lt("occurred_at", istDayStart(params.to, 1));

  const [{ data, count }, facets] = await Promise.all([
    query.returns<AuditRecord[]>(),
    loadAuditFacets(supabase),
  ]);

  const entries: AuditEntryData[] = (data ?? []).map((row) => {
    const described = describeAuditAction(row.action);
    return {
      id: row.id,
      when: formatDateIST(row.occurred_at, "d MMM yyyy, h:mm a"),
      actor: row.profiles?.full_name ?? "System",
      sentence: described.sentence,
      entityType: describeEntityType(row.entity_type),
      entityId: row.entity_id,
      href: auditEntityHref(row.entity_type, row.entity_id),
      before: auditPayloadLines(row.before),
      after: auditPayloadLines(row.after),
    };
  });

  const total = count ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const filtered = Boolean(params.who || params.what || params.entity || params.from || params.to);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every change anybody has made, and every export anybody has taken. Nothing here can be
          edited or deleted, by anyone, including you — the database refuses it.
        </p>
      </div>

      <form className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Who" htmlFor="who">
          <Combobox
            id="who"
            name="who"
            defaultValue={params.who ?? ""}
            options={facets.actors}
            placeholder="Anybody"
            clearable
            size="sm"
          />
        </Field>
        <Field label="What they touched" htmlFor="what">
          <Combobox
            id="what"
            name="what"
            defaultValue={params.what ?? ""}
            options={facets.subjects}
            placeholder="Anything"
            clearable
            size="sm"
          />
        </Field>
        <Field label="Table" htmlFor="entity">
          <Combobox
            id="entity"
            name="entity"
            defaultValue={params.entity ?? ""}
            options={facets.entityTypes}
            placeholder="Any table"
            clearable
            size="sm"
          />
        </Field>
        <Field label="From" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} className="h-8" />
        </Field>
        <div className="flex items-end gap-2">
          <Field label="To" htmlFor="to" className="flex-1">
            <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} className="h-8" />
          </Field>
          <Button type="submit" size="sm">
            Filter
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? filtered
              ? "Nothing matches those filters."
              : "Nothing has been recorded yet."
            : `${total.toLocaleString("en-IN")} ${total === 1 ? "entry" : "entries"}${
                filtered ? " matching" : ""
              }`}
        </p>
        {filtered && (
          <Link href="/settings/audit" className="text-sm hover:underline">
            Clear filters
          </Link>
        )}
      </div>

      {entries.length > 0 && (
        <div className="rounded-lg border bg-card px-4">
          {entries.map((entry) => (
            <AuditEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <PageLink params={params} page={page - 1} disabled={page === 0}>
            ← Newer
          </PageLink>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {lastPage + 1}
          </span>
          <PageLink params={params} page={page + 1} disabled={page >= lastPage}>
            Older →
          </PageLink>
        </div>
      )}
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: Record<string, string | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-sm text-muted-foreground opacity-50">{children}</span>;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") search.set(key, value);
  }
  if (page > 0) search.set("page", String(page));

  return (
    <Link href={`/settings/audit?${search.toString()}`} className="text-sm hover:underline">
      {children}
    </Link>
  );
}

/**
 * A date typed into the filter is a Kochi day, not a UTC one. Without
 * this, "from 15 September" would silently drop everything logged before
 * 5:30am that morning.
 */
function istDayStart(day: string, addDays = 0): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = Date.UTC(year, (month ?? 1) - 1, (date ?? 1) + addDays, 0, 0, 0);
  return new Date(utc - 5.5 * 60 * 60 * 1000).toISOString();
}
