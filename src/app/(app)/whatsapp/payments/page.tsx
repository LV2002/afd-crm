import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { leads, whatsappPaymentLinks } from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";
import { formatINR } from "@/lib/format/currency";

export const dynamic = "force-dynamic";

const LABEL = { created: "Waiting", paid: "Paid", expired: "Expired", cancelled: "Cancelled", failed: "Failed" } as const;

/**
 * Payment links sent from chats and whether they were paid. A paid link has
 * NOT been recorded in the ledger: accounts records it against the
 * enrolment, which is why each paid row says so.
 */
export default async function PaymentLinksPage() {
  const user = await getCurrentUser();
  if (!user || !(can(user, "payment.read") || can(user, "whatsapp.campaign"))) return <AccessDenied />;
  const rows = await db
    .select({
      id: whatsappPaymentLinks.id,
      leadId: whatsappPaymentLinks.leadId,
      leadName: leads.studentName,
      amountPaise: whatsappPaymentLinks.amountPaise,
      description: whatsappPaymentLinks.description,
      status: whatsappPaymentLinks.status,
      createdAt: whatsappPaymentLinks.createdAt,
      paidAt: whatsappPaymentLinks.paidAt,
    })
    .from(whatsappPaymentLinks)
    .innerJoin(leads, eq(leads.id, whatsappPaymentLinks.leadId))
    .orderBy(desc(whatsappPaymentLinks.createdAt))
    .limit(200);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Links sent from chats. A paid link is <strong>not yet in the ledger</strong> — record the payment in Admissions against the right enrolment and account.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payment links sent yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>For</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Link href={`/leads/${r.leadId}`} className="font-medium underline-offset-2 hover:underline">{r.leadName}</Link></TableCell>
                <TableCell className="max-w-xs truncate text-sm">{r.description}</TableCell>
                <TableCell className="text-right">{formatINR(r.amountPaise)}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "paid" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{LABEL[r.status]}</Badge>
                  {r.status === "paid" && <p className="text-xs text-muted-foreground">Paid {r.paidAt ? formatDateIST(r.paidAt.toISOString(), "d MMM, h:mm a") : ""} · record it</p>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDateIST(r.createdAt.toISOString(), "d MMM, h:mm a")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
