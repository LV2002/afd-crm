import { desc, isNull } from "drizzle-orm";
import { headers } from "next/headers";

import { AccessDenied } from "@/components/layout/access-denied";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappLinks } from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";

import { LinkActions, NewLinkForm } from "./link-forms";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;
  const rows = await db.select().from(whatsappLinks).where(isNull(whatsappLinks.deletedAt)).orderBy(desc(whatsappLinks.createdAt));
  const host = (await headers()).get("host") ?? "";
  const origin = host ? `https://${host}` : "";

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Put a short link in a message or template and see how many people tapped it. Each tap is counted, then the person is sent on to the page.
      </p>
      <NewLinkForm />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No links yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Short link</TableHead>
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
