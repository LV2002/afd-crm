import { inArray } from "drizzle-orm";

import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { contactListAudiences } from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";
import { getDropdownOptions } from "@/lib/fields/resolve-field-options";
import { createClient } from "@/lib/supabase/server";

import { ListForm } from "./list-form";

export const dynamic = "force-dynamic";

interface ListRow {
  id: string;
  name: string;
  source: string | null;
  description: string | null;
  center_id: string | null;
  use_for_ads: boolean;
  use_for_whatsapp: boolean;
}

export default async function ListsPage() {
  const user = (await getCurrentUser())!;
  const canManage = can(user, "contact.manage");
  const supabase = await createClient();

  const [{ data }, sources, { data: centerRows }] = await Promise.all([
    supabase
      .from("contact_lists")
      .select("id, name, source, description, center_id, use_for_ads, use_for_whatsapp")
      .is("archived_at", null)
      .order("name")
      .returns<ListRow[]>(),
    getDropdownOptions(supabase, "lead_source"),
    supabase.from("centers").select("id, name").eq("is_active", true).order("name").returns<Array<{ id: string; name: string }>>(),
  ]);
  const lists = data ?? [];
  const centers = (centerRows ?? []).map((c) => ({ value: c.id, label: c.name }));

  const counts = await Promise.all(
    lists.map(async (l) => {
      const { count } = await supabase.from("contact_list_members").select("contact_id", { count: "exact", head: true }).eq("list_id", l.id);
      return [l.id, count ?? 0] as const;
    }),
  );
  const countByList = new Map(counts);

  // The ad audiences each list feeds. Read directly: the table is only for
  // the sync jobs and has no policy for browser roles.
  const audienceRows =
    lists.length === 0
      ? []
      : await db.select().from(contactListAudiences).where(inArray(contactListAudiences.listId, lists.map((l) => l.id)));
  const audiencesByList = new Map<string, typeof audienceRows>();
  for (const row of audienceRows) audiencesByList.set(row.listId, [...(audiencesByList.get(row.listId) ?? []), row]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        A list is one batch with one origin: a school seminar, a purchased database, an exam-application file. The same
        person can be on several lists; they are one contact.
      </p>

      {canManage && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">New list</h2>
          <ListForm
            values={{ name: "", source: "", description: "", centerId: "", useForAds: true, useForWhatsapp: false }}
            sources={sources}
            centers={centers}
            canManage
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Your lists</h2>
        {lists.length === 0 && <p className="text-sm text-muted-foreground">No lists yet.</p>}
        {lists.map((l) => (
          <div key={l.id} className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{countByList.get(l.id)?.toLocaleString("en-IN")} people</p>
            {l.use_for_ads && (
              <p className="text-xs text-muted-foreground">
                {(audiencesByList.get(l.id) ?? []).length === 0
                  ? "Ad audiences: created on the next hourly sync (Meta and Google)."
                  : (audiencesByList.get(l.id) ?? [])
                      .map(
                        (a) =>
                          `${a.platform === "meta" ? "Meta" : "Google"}: ${
                            a.lastError
                              ? `problem — ${a.lastError}`
                              : a.lastSyncedAt
                                ? `synced ${formatDateIST(a.lastSyncedAt, "d MMM, h:mm a")}`
                                : "created"
                          }`,
                      )
                      .join(" · ")}
              </p>
            )}
            <ListForm
              values={{
                id: l.id,
                name: l.name,
                source: l.source ?? "",
                description: l.description ?? "",
                centerId: l.center_id ?? "",
                useForAds: l.use_for_ads,
                useForWhatsapp: l.use_for_whatsapp,
              }}
              sources={sources}
              centers={centers}
              canManage={canManage}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
