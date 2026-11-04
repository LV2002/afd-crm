import Link from "next/link";

import { can, getCurrentUser } from "@/lib/auth/session";
import { leadStateFor } from "@/lib/contacts/lead-matches";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { resolveFieldOptions } from "@/lib/fields/resolve-field-options";
import { maskPhone } from "@/lib/leads/mask-phone";
import { createClient } from "@/lib/supabase/server";

import { ContactsTable, type ContactRow } from "./contacts-table";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [50, 100, 200] as const;

interface DbContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  fields: Record<string, unknown> | null;
  lead_id: string | null;
  linked_how: string | null;
  contact_list_members: Array<{ list_id: string }>;
}

function href(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== 1) p.set(k, String(v));
  const qs = p.toString();
  return qs ? `/database?${qs}` : "/database";
}

export default async function DatabasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = (await getCurrentUser())!;
  const params = await searchParams;
  const one = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v : "";
  };

  const listFilter = one("list");
  const q = one("q").replace(/[,()%*\\]/g, " ").trim();
  const status = one("status") === "linked" || one("status") === "unlinked" ? one("status") : "";
  const requestedSize = Number(one("size"));
  const size = (PAGE_SIZES as readonly number[]).includes(requestedSize) ? requestedSize : PAGE_SIZES[0];
  const page = Math.max(1, Number(one("page")) || 1);

  const supabase = await createClient();

  const { data: listRows } = await supabase
    .from("contact_lists")
    .select("id, name")
    .is("archived_at", null)
    .order("name")
    .returns<Array<{ id: string; name: string }>>();
  const lists = listRows ?? [];
  const listName = new Map(lists.map((l) => [l.id, l.name]));

  const counts = await Promise.all(
    lists.map(async (l) => {
      const { count } = await supabase
        .from("contact_list_members")
        .select("contact_id", { count: "exact", head: true })
        .eq("list_id", l.id);
      return [l.id, count ?? 0] as const;
    }),
  );
  const countByList = new Map(counts);

  let query = supabase
    .from("contacts")
    .select(
      `id, name, phone, email, fields, lead_id, linked_how, contact_list_members${listFilter ? "!inner" : ""}(list_id)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (listFilter) query = query.eq("contact_list_members.list_id", listFilter);
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  if (status === "linked") query = query.not("lead_id", "is", null);
  if (status === "unlinked") query = query.is("lead_id", null);

  const { data, count } = await query.returns<DbContact[]>();
  const found = data ?? [];
  const total = count ?? 0;

  // Which of this page's people are already leads — worked out now, not
  // stored, so a lead that arrived after the import is recognised too.
  const leadState = await leadStateFor(
    found.map((c) => ({ id: c.id, phone: c.phone, email: c.email, leadId: c.lead_id })),
  );

  // "Class" is the question every seminar sheet asks; show its label, not its key.
  const schema = await getFieldSchema(supabase, "lead", user);
  const classField = schema.find((f) => f.key === "education_status");
  const classOptions = classField ? await resolveFieldOptions(supabase, classField) : [];
  const classLabel = new Map(classOptions.map((o) => [o.value, o.label]));

  const rows: ContactRow[] = found.map((c) => {
    const s = leadState.get(c.id);
    const cls = typeof c.fields?.education_status === "string" ? c.fields.education_status : null;
    return {
      id: c.id,
      name: c.name,
      maskedPhone: c.phone ? maskPhone(c.phone) : null,
      hasPhone: Boolean(c.phone),
      email: c.email,
      className: cls ? (classLabel.get(cls) ?? cls) : null,
      city: typeof c.fields?.city === "string" ? c.fields.city : null,
      lists: c.contact_list_members.map((m) => listName.get(m.list_id)).filter((n): n is string => Boolean(n)),
      linked: s?.linked ? { leadId: s.linked.leadId, leadNumber: s.linked.leadNumber, how: c.linked_how } : null,
      match: s?.match
        ? { leadId: s.match.leadId, leadNumber: s.match.leadNumber, counsellor: s.match.counsellorName }
        : null,
    };
  });

  const lastPage = Math.max(1, Math.ceil(total / size));
  const base = { list: listFilter, q: one("q"), status, size: size === PAGE_SIZES[0] ? undefined : size };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href={href({ ...base, list: "" })}
          className={`rounded-full border px-3 py-1 ${listFilter === "" ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent/50"}`}
        >
          Everyone
        </Link>
        {lists.map((l) => (
          <Link
            key={l.id}
            href={href({ ...base, list: l.id })}
            className={`rounded-full border px-3 py-1 ${listFilter === l.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent/50"}`}
          >
            {l.name} <span className="opacity-70">({countByList.get(l.id)})</span>
          </Link>
        ))}
        {lists.length === 0 && (
          <span className="text-muted-foreground">
            No lists yet.{" "}
            {can(user, "contact.manage") && (
              <Link href="/database/lists" className="underline">
                Create one
              </Link>
            )}
          </span>
        )}
      </div>

      <form method="get" action="/database" className="flex flex-wrap items-center gap-2">
        {listFilter && <input type="hidden" name="list" value={listFilter} />}
        <input
          name="q"
          defaultValue={one("q")}
          placeholder="Search name, email or number…"
          className="h-9 w-72 rounded-md border bg-background px-3 text-sm"
        />
        <select name="status" defaultValue={status} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="">Everyone</option>
          <option value="unlinked">Not moved into the leads</option>
          <option value="linked">Already moved or merged into a lead</option>
        </select>
        <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-accent/50">
          Filter
        </button>
        <span className="text-sm text-muted-foreground">{total.toLocaleString("en-IN")} people</span>
      </form>

      <ContactsTable
        rows={rows}
        canPromote={can(user, "contact.promote") && can(user, "lead.create")}
        canReveal={can(user, "lead.reveal_phone")}
        canManage={can(user, "contact.manage")}
      />

      {lastPage > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link href={href({ ...base, page: page - 1 })} className="underline">
              ← Previous
            </Link>
          )}
          <span className="text-muted-foreground">
            Page {page} of {lastPage}
          </span>
          {page < lastPage && (
            <Link href={href({ ...base, page: page + 1 })} className="underline">
              Next →
            </Link>
          )}
          <span className="ml-auto flex gap-2 text-muted-foreground">
            Show
            {PAGE_SIZES.map((n) => (
              <Link key={n} href={href({ ...base, size: n === PAGE_SIZES[0] ? undefined : n })} className={n === size ? "font-semibold text-foreground" : "underline"}>
                {n}
              </Link>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
