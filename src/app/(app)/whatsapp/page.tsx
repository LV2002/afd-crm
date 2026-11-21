import Link from "next/link";
import { inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { profiles, whatsappNumbers } from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";
import { summariseSources, type SourceDef } from "@/lib/whatsapp/chat-sources";
import { getWhatsAppThreads } from "@/lib/whatsapp/get-threads";

export const dynamic = "force-dynamic";

/**
 * **Chats** — where every conversation channel is listed.
 *
 * One row per source: the institute's WhatsApp API number, and each
 * counsellor's own number, with how many conversations are open and how
 * many are waiting on a reply. Clicking a row opens that source's inbox.
 *
 * Counts come from the same RLS-scoped read the inboxes use, so a
 * counsellor sees only their own numbers' figures and a centre head their
 * centre's — nothing here widens access. Source rows are shown when the
 * person can reach them: the API row for whoever runs campaigns (or has
 * conversations there), a counsellor number for its owner, anybody who
 * can see a thread on it, and whoever runs campaigns.
 */
export default async function ChatsHubPage({ searchParams }: { searchParams: Promise<{ thread?: string }> }) {
  // Links from before the hub existed pointed the API inbox at /whatsapp.
  const { thread } = await searchParams;
  if (thread) redirect(`/whatsapp/api?thread=${encodeURIComponent(thread)}`);

  const user = await getCurrentUser();
  if (!user) return null;
  const isCampaigner = can(user, "whatsapp.campaign");

  const numbers = await db
    .select({
      id: whatsappNumbers.id,
      label: whatsappNumbers.label,
      mode: whatsappNumbers.mode,
      counsellorId: whatsappNumbers.counsellorId,
    })
    .from(whatsappNumbers)
    .where(isNull(whatsappNumbers.deletedAt));
  const ownerIds = numbers.flatMap((n) => (n.counsellorId ? [n.counsellorId] : []));
  const owners = ownerIds.length
    ? await db.select({ id: profiles.id, name: profiles.fullName }).from(profiles).where(inArray(profiles.id, ownerIds))
    : [];
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));

  const supabase = await createClient();
  const threads = await getWhatsAppThreads(supabase, {
    numberIds: numbers.map((n) => n.id),
    includeUnassigned: true,
  });

  const apiIds = new Set(numbers.filter((n) => n.mode === "api").map((n) => n.id));
  const defs: SourceDef[] = [
    { key: "api", label: "WhatsApp API", sublabel: "The institute's number", href: "/whatsapp/api", numberIds: [...apiIds], includesUnnumbered: true, kind: "api" },
    ...numbers
      .filter((n) => n.mode === "coexistence")
      .map((n): SourceDef => ({
        key: n.id,
        label: n.counsellorId ? (ownerName.get(n.counsellorId) ?? n.label) : n.label,
        sublabel: n.counsellorId ? `${n.label} · counsellor's own number` : "Own number, no counsellor set",
        href: `/whatsapp/personal?number=${n.id}`,
        numberIds: [n.id],
        includesUnnumbered: false,
        kind: "own",
        ownerId: n.counsellorId,
      })),
  ];

  const rows = summariseSources(defs, threads, { userId: user.id, isCampaigner });
  const totals = rows.reduce(
    (acc, r) => ({ open: acc.open + r.open, awaiting: acc.awaiting + r.awaiting }),
    { open: 0, awaiting: 0 },
  );

  // Somebody with nothing to see and nothing to run goes straight to the
  // inbox that explains why it is empty.
  if (rows.length === 0) redirect("/whatsapp/personal");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-3xl font-semibold">{totals.awaiting}</p><p className="text-sm text-muted-foreground">Waiting for a reply</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-3xl font-semibold">{totals.open}</p><p className="text-sm text-muted-foreground">Open conversations</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-3xl font-semibold">{rows.length}</p><p className="text-sm text-muted-foreground">Chat sources</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where chats come in</CardTitle>
          <CardDescription>The institute&rsquo;s API number and each counsellor&rsquo;s own WhatsApp. Open one to see its conversations.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Waiting for a reply</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="text-right">Not in the CRM</TableHead>
                <TableHead>Last message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>
                    <Link href={r.href} className="font-medium underline-offset-2 hover:underline">{r.label}</Link>
                    {r.kind === "api" && <Badge variant="secondary" className="ml-2">API</Badge>}
                    <p className="text-xs text-muted-foreground">{r.sublabel}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.awaiting > 0 ? <span className="font-semibold text-amber-700 dark:text-amber-400">{r.awaiting}</span> : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell className="text-right">{r.open}</TableCell>
                  <TableCell className="text-right">{r.unmatched}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.lastMessageAt ? formatDateIST(r.lastMessageAt, "d MMM, h:mm a") : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            <Link href="/whatsapp/personal" className="underline">All counsellor chats together</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
