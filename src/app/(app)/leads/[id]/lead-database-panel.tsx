import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db/client";
import { leadIdentifiers } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

interface Row {
  id: string;
  name: string;
  linked_how: string | null;
  lead_id: string | null;
  contact_list_members: Array<{ contact_lists: { name: string } | null }>;
}

/**
 * Says so when a lead is also in the contact database.
 *
 * The database keeps people after they become leads, so the lead page should
 * show it: which lists they were on, and whether this lead came from one of
 * them. Matched by the lead's own phones and emails as well as by an explicit
 * move or merge, so someone who was in a purchased list before they enquired
 * is recognised too. Renders nothing for anyone who cannot read the database,
 * or when the lead is not in it.
 */
export async function LeadDatabasePanel({ leadId }: { leadId: string }) {
  const identifiers = await db
    .select({ kind: leadIdentifiers.kind, value: leadIdentifiers.valueNormalised })
    .from(leadIdentifiers)
    .where(and(eq(leadIdentifiers.leadId, leadId), isNull(leadIdentifiers.deletedAt)));
  const phones = identifiers.filter((i) => i.kind === "phone").map((i) => i.value);
  const emails = identifiers.filter((i) => i.kind === "email").map((i) => i.value);

  const supabase = await createClient();
  const clauses = [`lead_id.eq.${leadId}`];
  if (phones.length) clauses.push(`phone.in.(${phones.map((p) => `"${p}"`).join(",")})`);
  if (emails.length) clauses.push(`email.in.(${emails.map((e) => `"${e.replace(/"/g, "")}"`).join(",")})`);

  const { data } = await supabase
    .from("contacts")
    .select("id, name, lead_id, linked_how, contact_list_members(contact_lists(name))")
    .or(clauses.join(","))
    .returns<Row[]>();
  const found = data ?? [];
  if (found.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm">
      <Badge variant="outline">In the database</Badge>
      {found.map((c) => {
        const lists = c.contact_list_members.map((m) => m.contact_lists?.name).filter(Boolean).join(", ");
        const how =
          c.lead_id === leadId ? (c.linked_how === "merged" ? "merged from" : "moved from") : "also on";
        return (
          <span key={c.id} className="text-muted-foreground">
            {how} {lists || "a list"} ·{" "}
            <Link href={`/database/${c.id}`} className="underline">
              Open the contact
            </Link>
          </span>
        );
      })}
    </div>
  );
}
