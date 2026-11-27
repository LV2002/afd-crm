import { desc, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { AccessDenied } from "@/components/layout/access-denied";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappBroadcasts, whatsappFlows, whatsappLinks } from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";

import { LinkActions, NewLinkForm } from "./link-forms";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;
  const rows = await db.select().from(whatsappLinks).where(isNull(whatsappLinks.deletedAt)).orderBy(desc(whatsappLinks.createdAt));
  const [broadcastRows, flowRows] = await Promise.all([
    db.select({ id: whatsappBroadcasts.id, name: whatsappBroadcasts.name }).from(whatsappBroadcasts).orderBy(desc(whatsappBroadcasts.createdAt)).limit(100),
    db.select({ id: whatsappFlows.id, name: whatsappFlows.name }).from(whatsappFlows).where(isNull(whatsappFlows.deletedAt)).orderBy(whatsappFlows.name),
  ]);
  const campaigns = [
    ...broadcastRows.map((b) => ({ value: `b:${b.id}`, label: `Broadcast: ${b.name}` })),
    ...flowRows.map((f) => ({ value: `f:${f.id}`, label: `Automation: ${f.name}` })),
  ];
  // Taps per campaign: all time and the last seven days, from the click log.
  const perCampaign = [
    ...(await db.execute<{ campaign: string; links: number; taps: number; recent: number; people: number }>(sql`
      select coalesce(l.campaign, 'No campaign') as campaign,
             count(distinct l.id)::int as links,
             count(c.id)::int as taps,
             count(c.id) filter (where c.clicked_at > now() - interval '7 days')::int as recent,
             count(distinct c.ref) filter (where c.ref is not null)::int as people
      from whatsapp_links l
      left join whatsapp_link_clicks c on c.link_id = l.id
      where l.deleted_at is null
      group by 1
      order by taps desc, campaign`)),
  ];
  const host = (await headers()).get("host") ?? "";
  const origin = host ? `https://${host}` : "";

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Put a short link in a message or template and see how many people tapped it. Each tap is counted, then the person is sent on to the page.
      </p>
      <NewLinkForm campaigns={campaigns} />
      {perCampaign.length > 0 && rows.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Taps by campaign</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Links</TableHead>
                <TableHead>Taps</TableHead>
                <TableHead>Last 7 days</TableHead>
                <TableHead>Different people</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perCampaign.map((c) => (
                <TableRow key={c.campaign}>
                  <TableCell className="font-medium">{c.campaign}</TableCell>
                  <TableCell>{c.links}</TableCell>
                  <TableCell>{c.taps}</TableCell>
                  <TableCell>{c.recent}</TableCell>
                  <TableCell>{c.people > 0 ? c.people : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            &ldquo;Different people&rdquo; counts distinct <code className="font-mono">?r=</code> values on the short link,
            when you add one per recipient.
          </p>
        </section>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No links yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Short link</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Taps</TableHead>
              <TableHead>Last tap</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.name}
                  <p className="max-w-xs truncate text-xs font-normal text-muted-foreground">{r.url}</p>
                </TableCell>
                <TableCell className="font-mono text-xs">{origin}/l/{r.code}</TableCell>
                <TableCell className="text-sm">{r.campaign ?? "—"}</TableCell>
                <TableCell>{r.clicks}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.lastClickedAt ? formatDateIST(r.lastClickedAt.toISOString(), "d MMM, h:mm a") : "—"}</TableCell>
                <TableCell className="text-right"><LinkActions id={r.id} shortUrl={`${origin}/l/${r.code}`} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
