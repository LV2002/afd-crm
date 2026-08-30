import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { formatINR } from "@/lib/format/currency";
import { maskPhone } from "@/lib/leads/mask-phone";
import { createClient } from "@/lib/supabase/server";

import { RevealPhoneButton } from "../leads/reveal-phone-button";

interface EnrolmentQueueRow {
  id: string;
  lead_id: string;
  course: string;
  net_fee_paise: number;
  status: string;
  sales_to_accounts_at: string | null;
  accounts_to_academics_at: string | null;
  leads: { student_name: string; primary_phone: string } | null;
  centers: { name: string } | null;
}

/**
 * Accounts' work queue: every enrolment Gate 1 has produced (RLS's
 * enrolments_select already scopes this to the caller's centre(s) via
 * can_access_center('enrolment.read', ...)). Not filtered down to only
 * "awaiting first payment" — instalment tracking isn't built yet (see
 * docs/DECISIONS.md), so this is also where a second/third payment against
 * an already-active enrolment gets recorded. Rows still waiting on Gate 2
 * sort first, since that's the more time-sensitive case.
 */
export default async function AccountsQueuePage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "payment.read")) return <AccessDenied />;

  const supabase = await createClient();
  const canRevealPhone = can(user, "lead.reveal_phone");

  const { data: enrolmentRows, error } = await supabase
    .from("enrolments")
    .select(
      "id, lead_id, course, net_fee_paise, status, sales_to_accounts_at, accounts_to_academics_at, leads(student_name, primary_phone), centers(name)",
    )
    .is("deleted_at", null)
    .order("sales_to_accounts_at", { ascending: true })
    .returns<EnrolmentQueueRow[]>();

  if (error) {
    throw new Error(`Failed to load the accounts queue: ${error.message}`);
  }

  const rows = enrolmentRows ?? [];
  const enrolmentIds = rows.map((r) => r.id);

  const paidByEnrolmentId = new Map<string, number>();
  if (enrolmentIds.length > 0) {
    const { data: paymentRows } = await supabase
      .from("payments")
      .select("enrolment_id, amount_paise, direction")
      .in("enrolment_id", enrolmentIds)
      .returns<Array<{ enrolment_id: string; amount_paise: number; direction: "credit" | "debit" }>>();

    for (const p of paymentRows ?? []) {
      const delta = p.direction === "credit" ? p.amount_paise : -p.amount_paise;
      paidByEnrolmentId.set(p.enrolment_id, (paidByEnrolmentId.get(p.enrolment_id) ?? 0) + delta);
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const aWaiting = a.accounts_to_academics_at === null;
    const bWaiting = b.accounts_to_academics_at === null;
    if (aWaiting !== bWaiting) return aWaiting ? -1 : 1;
    return (a.sales_to_accounts_at ?? "").localeCompare(b.sales_to_accounts_at ?? "");
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="text-sm text-muted-foreground">Confirmed admissions awaiting payment.</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Course</TableHead>
            <TableHead>Centre</TableHead>
            <TableHead>Net fee</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Confirmed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => {
            const paid = paidByEnrolmentId.get(row.id) ?? 0;
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/accounts/${row.id}`} className="font-medium hover:underline">
                    {row.leads?.student_name ?? "—"}
                  </Link>
                  <div>
                    <RevealPhoneButton
                      leadId={row.lead_id}
                      masked={maskPhone(row.leads?.primary_phone ?? null)}
                      canReveal={canRevealPhone}
                    />
                  </div>
                </TableCell>
                <TableCell>{row.course}</TableCell>
                <TableCell>{row.centers?.name ?? "—"}</TableCell>
                <TableCell>{formatINR(row.net_fee_paise)}</TableCell>
                <TableCell>{formatINR(paid)}</TableCell>
                <TableCell>
                  <Badge variant={row.accounts_to_academics_at ? "secondary" : "outline"}>
                    {row.accounts_to_academics_at ? row.status : "awaiting first payment"}
                  </Badge>
                </TableCell>
                <TableCell>{formatDateIST(row.sales_to_accounts_at, "d MMM yyyy")}</TableCell>
              </TableRow>
            );
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Nothing in the accounts queue.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
