import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { formatINR } from "@/lib/format/currency";
import { maskPhone } from "@/lib/leads/mask-phone";
import { createClient } from "@/lib/supabase/server";

import { RevealPhoneButton } from "../../leads/reveal-phone-button";
import { AgreedPlan } from "@/components/enrolment/agreed-plan";
import { PendingDiscount } from "@/components/enrolment/pending-discount";
import { getAccounts } from "@/lib/finance/get-finance";

import { OpenFileButton } from "@/components/files/open-file-button";
import { getSignedAgreement } from "@/lib/storage/attachments";

import { DropAdmissionForm } from "./drop-admission-form";
import { RecordPaymentForm } from "./record-payment-form";

interface EnrolmentDetail {
  id: string;
  lead_id: string;
  course: string;
  mode: string;
  academic_year: string;
  total_fee_paise: number;
  discount_paise: number;
  discount_name: string | null;
  down_payment_paise: number;
  fee_notes: string | null;
  net_fee_paise: number;
  status: string;
  dropped_at: string | null;
  drop_reason: string | null;
  pending_discount_paise: number | null;
  pending_discount_at: string | null;
  enrolled_at: string;
  sales_to_accounts_at: string | null;
  accounts_to_academics_at: string | null;
  student_id: string | null;
  leads: { student_name: string; primary_phone: string } | null;
  centers: { name: string } | null;
}

interface PaymentRow {
  id: string;
  amount_paise: number;
  direction: "credit" | "debit";
  method: string;
  reference: string | null;
  received_at: string;
  reversal_reason: string | null;
}

export default async function EnrolmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "payment.read")) return <AccessDenied />;

  const { id } = await params;
  const supabase = await createClient();

  const { data: enrolment } = await supabase
    .from("enrolments")
    .select(
      "id, lead_id, course, mode, academic_year, total_fee_paise, discount_paise, discount_name, down_payment_paise, fee_notes, net_fee_paise, status, dropped_at, drop_reason, pending_discount_paise, pending_discount_at, enrolled_at, sales_to_accounts_at, accounts_to_academics_at, student_id, leads(student_name, primary_phone), centers(name)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<EnrolmentDetail>();

  if (!enrolment) notFound();

  // Accounts staff hold finance.read, so this returns their centre's
  // accounts; if a role somehow does not, RLS returns nothing and the
  // picker simply does not render.
  const financeAccounts = (await getAccounts(supabase)).map((a) => ({ id: a.id, name: a.name }));

  // The schedule the counsellor agreed. Accounts needs it to answer the
  // one question this screen exists for — has the fee been collected? —
  // and it lived only on the lead's page, which they have no reason to
  // open.
  const { data: instalmentRows } = await supabase
    .from("enrolment_instalments")
    .select("id, sequence, due_date, amount_paise")
    .eq("enrolment_id", id)
    .order("sequence")
    .returns<Array<{ id: string; sequence: number; due_date: string; amount_paise: number }>>();

  const [{ data: paymentRows }, { data: receiptRows }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount_paise, direction, method, reference, received_at, reversal_reason")
      .eq("enrolment_id", id)
      .order("received_at", { ascending: false })
      .returns<PaymentRow[]>(),
    supabase
      .from("receipts")
      .select("payment_id, receipt_no")
      .eq("enrolment_id", id)
      .returns<Array<{ payment_id: string; receipt_no: number }>>(),
  ]);

  const receiptNoByPaymentId = new Map((receiptRows ?? []).map((r) => [r.payment_id, r.receipt_no]));
  const payments = paymentRows ?? [];
  const paidPaise = payments.reduce(
    (sum, p) => sum + (p.direction === "credit" ? p.amount_paise : -p.amount_paise),
    0,
  );
  const balancePaise = enrolment.net_fee_paise - paidPaise;

  // The agreement the instalments on this screen come from. Accounts hold
  // `file.read` at centre scope, so the same policy that shows it to the
  // counsellor shows it to them — there is no accounts-specific rule here,
  // only a place to see it. Before this it lived solely on the lead page,
  // which accounts have no reason to open.
  const signedAgreement = can(user, "file.read")
    ? await getSignedAgreement(supabase, enrolment.lead_id)
    : null;

  const canRecordPayment = can(user, "payment.record");
  const canRevealPhone = can(user, "lead.reveal_phone");
  const canDrop = can(user, "enrolment.drop");
  const isDropped = enrolment.dropped_at !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{enrolment.leads?.student_name ?? "—"}</h1>
          <p className="text-sm text-muted-foreground">
            {enrolment.course} · {enrolment.mode} · {enrolment.academic_year}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDropped && <Badge variant="destructive">Dropped</Badge>}
          <Badge variant={enrolment.accounts_to_academics_at ? "secondary" : "outline"}>
            {enrolment.accounts_to_academics_at ? enrolment.status : "awaiting first payment"}
          </Badge>
          {enrolment.centers?.name && <Badge variant="outline">{enrolment.centers.name}</Badge>}
        </div>
      </div>

      {/*
        Said once, loudly, at the top. Everything below it — the fee plan,
        the balance, the ledger — reads as an active admission otherwise,
        and somebody chases a student who left.
      */}
      {isDropped && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">
            This student dropped the course on{" "}
            {formatDateIST(enrolment.dropped_at, "d MMM yyyy")}.
          </p>
          {enrolment.drop_reason && (
            <p className="mt-1 text-sm">
              <span className="text-muted-foreground">Reason: </span>
              {enrolment.drop_reason}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            The outstanding balance is no longer chased and the admission no longer counts as a
            conversion. Fees already collected stay on the books — a refund is recorded
            separately.
          </p>
        </div>
      )}

      {/*
        Accounts see it too: it is the reason the balance they are chasing
        is higher than the figure the student was quoted.
      */}
      {enrolment.pending_discount_paise !== null && (
        <PendingDiscount
          enrolmentId={id}
          pendingPaise={enrolment.pending_discount_paise}
          requestedBy={null}
          requestedAt={enrolment.pending_discount_at}
          totalFeePaise={enrolment.total_fee_paise}
          canDecide={can(user, "discount.approve")}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
            <Field label="Phone">
              <RevealPhoneButton
                leadId={enrolment.lead_id}
                masked={maskPhone(enrolment.leads?.primary_phone ?? null)}
                canReveal={canRevealPhone}
              />
            </Field>
            <Field label="Total fee">{formatINR(enrolment.total_fee_paise)}</Field>
            <Field label="Discount">{formatINR(enrolment.discount_paise)}</Field>
            <Field label="Net fee">{formatINR(enrolment.net_fee_paise)}</Field>
            <Field label="Paid">{formatINR(paidPaise)}</Field>
            <Field label="Balance">{formatINR(balancePaise)}</Field>
            <Field label="Confirmed">{formatDateIST(enrolment.sales_to_accounts_at, "d MMM yyyy")}</Field>
            <Field label="Student created">
              {enrolment.accounts_to_academics_at ? formatDateIST(enrolment.accounts_to_academics_at, "d MMM yyyy") : "—"}
            </Field>
          </div>

          <AgreedPlan
            totalFeePaise={enrolment.total_fee_paise}
            discountPaise={enrolment.discount_paise}
            discountName={enrolment.discount_name}
            downPaymentPaise={enrolment.down_payment_paise}
            netFeePaise={enrolment.net_fee_paise}
            feeNotes={enrolment.fee_notes}
            instalments={(instalmentRows ?? []).map((row) => ({
              id: row.id,
              sequence: row.sequence,
              dueDate: row.due_date,
              amountPaise: row.amount_paise,
            }))}
            payments={payments.map((p) => ({
              id: p.id,
              receivedOn: p.received_at.slice(0, 10),
              // A debit is a reversal or refund, so it reduces what has
              // been received and un-settles the instalment it covered.
              amountPaise: p.direction === "credit" ? p.amount_paise : -p.amount_paise,
            }))}
            asOf={new Date().toISOString().slice(0, 10)}
          />

          <div>
            <h2 className="mb-2 text-lg font-semibold">Payment ledger</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{receiptNoByPaymentId.get(p.id) ? `#${receiptNoByPaymentId.get(p.id)}` : "—"}</TableCell>
                    <TableCell>{formatDateIST(p.received_at, "d MMM yyyy, h:mm a")}</TableCell>
                    <TableCell className={p.direction === "debit" ? "text-destructive" : undefined}>
                      {p.direction === "debit" ? "−" : ""}
                      {formatINR(p.amount_paise)}
                      {p.reversal_reason ? ` (${p.reversal_reason})` : ""}
                    </TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell>{p.reference ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No payments recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {can(user, "file.read") && (
            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <h2 className="text-sm font-semibold">Signed agreement</h2>
              {signedAgreement ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Uploaded {formatDateIST(signedAgreement.created_at, "d MMM yyyy")}
                  </p>
                  <OpenFileButton attachmentId={signedAgreement.id} variant="outline" label="Open agreement" />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Not uploaded yet. The counsellor uploads it on the lead; it appears here as soon
                  as they do.
                </p>
              )}
            </div>
          )}
          {canRecordPayment && <RecordPaymentForm enrolmentId={id} accounts={financeAccounts} />}
          {canDrop && <DropAdmissionForm enrolmentId={id} isDropped={isDropped} />}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}
