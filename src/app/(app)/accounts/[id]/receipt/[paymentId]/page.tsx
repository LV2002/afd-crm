import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { DocumentFooter, Letterhead } from "@/components/print/letterhead";
import { PrintButton } from "@/components/print/print-button";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getBrand } from "@/lib/brand/get-brand";
import { formatINR } from "@/lib/format/currency";
import { formatDateIST } from "@/lib/format/date";
import { amountInWords } from "@/lib/format/words";
import { A4_PORTRAIT_CSS } from "@/lib/print/page-css";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * A receipt somebody can actually be handed.
 *
 * Receipt numbers have been issued from a gapless database sequence since
 * the finance module shipped, and appeared nowhere except a column on an
 * internal screen. A family that pays ₹40,000 in cash at the front desk
 * got a row in a CRM — and asking for "a receipt" is not an unusual
 * request, it is the normal one.
 *
 * ## Reprinting is not reissuing
 *
 * Nothing here writes. The receipt number, the amount and the date all
 * come from rows that are append-only by design (CLAUDE.md § 7), so the
 * tenth print of a receipt is identical to the first. A correction is a
 * reversal entry with its own receipt, which is why a reversed payment
 * prints marked as one rather than quietly disappearing.
 *
 * ## The amount in words
 *
 * Not decoration — it is the line that makes a receipt hard to alter, and
 * the reason every printed receipt in India has one.
 */

interface PaymentRow {
  id: string;
  enrolment_id: string;
  amount_paise: number;
  direction: "credit" | "debit";
  method: string;
  reference: string | null;
  received_at: string;
  reversal_reason: string | null;
  reverses_payment_id: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  neft: "Bank transfer (NEFT)",
  cheque: "Cheque",
  other: "Other",
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;
  const user = await getCurrentUser();
  if (!user || !can(user, "payment.read")) return <AccessDenied />;

  const supabase = await createClient();

  // Read through the caller's own client: the payments policy is centre
  // scoped, so a counsellor at Kannur cannot print a Kochi receipt by
  // guessing a URL. No app-level check is re-implemented here because
  // none is needed — RLS is the boundary.
  const { data: payment } = await supabase
    .from("payments")
    .select(
      "id, enrolment_id, amount_paise, direction, method, reference, received_at, reversal_reason, reverses_payment_id",
    )
    .eq("id", paymentId)
    .eq("enrolment_id", id)
    .maybeSingle<PaymentRow>();

  if (!payment) notFound();

  const [{ data: receipt }, { data: enrolment }, brand] = await Promise.all([
    supabase
      .from("receipts")
      .select("receipt_no, issued_at")
      .eq("payment_id", paymentId)
      .maybeSingle<{ receipt_no: number; issued_at: string }>(),
    supabase
      .from("enrolments")
      .select(
        "id, course, academic_year, net_fee_paise, leads(student_name), centers(name, address, phone, email)",
      )
      .eq("id", id)
      .maybeSingle<{
        id: string;
        course: string;
        academic_year: string;
        net_fee_paise: number;
        leads: { student_name: string } | null;
        centers: { name: string; address: string | null; phone: string | null; email: string | null } | null;
      }>(),
    getBrand(),
  ]);

  if (!enrolment) notFound();

  // What they have paid in total, so the receipt can state the balance —
  // the question that otherwise generates the next phone call.
  const { data: allPayments } = await supabase
    .from("payments")
    .select("amount_paise, direction, received_at")
    .eq("enrolment_id", id)
    .lte("received_at", payment.received_at)
    .returns<Array<{ amount_paise: number; direction: string; received_at: string }>>();

  const paidToDate = (allPayments ?? []).reduce(
    (sum, row) => sum + (row.direction === "credit" ? row.amount_paise : -row.amount_paise),
    0,
  );
  const balance = enrolment.net_fee_paise - paidToDate;

  const isReversal = payment.direction === "debit";
  const accent = brand.primaryColor;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: A4_PORTRAIT_CSS }} />
      <div className="mx-auto max-w-[210mm] bg-white p-8 text-black print:p-0">
        <div className="no-print">
          <PrintButton />
        </div>

        <Letterhead
          brand={brand}
          title={isReversal ? "Refund / Reversal Note" : "Fee Receipt"}
          reference={
            receipt ? `Receipt No: ${receipt.receipt_no}` : "Receipt No: not issued"
          }
          centre={
            enrolment.centers
              ? {
                  name: enrolment.centers.name,
                  address: enrolment.centers.address,
                  phone: enrolment.centers.phone,
                  email: enrolment.centers.email,
                }
              : null
          }
        />

        {isReversal && (
          <p className="mb-4 border p-2 text-sm font-semibold" style={{ borderColor: accent }}>
            This entry reverses an earlier payment. It is not a receipt for money received.
            {payment.reversal_reason ? ` Reason: ${payment.reversal_reason}` : ""}
          </p>
        )}

        <table className="mb-6 w-full text-sm">
          <tbody>
            <Row label="Received from" value={enrolment.leads?.student_name ?? "—"} />
            <Row label="Course" value={`${enrolment.course} · ${enrolment.academic_year}`} />
            <Row
              label={isReversal ? "Reversed on" : "Received on"}
              value={formatDateIST(payment.received_at, "d MMMM yyyy")}
            />
            <Row label="Mode of payment" value={METHOD_LABELS[payment.method] ?? payment.method} />
            {payment.reference && <Row label="Reference" value={payment.reference} />}
          </tbody>
        </table>

        <div
          className="mb-2 flex items-baseline justify-between border-y-2 py-3"
          style={{ borderColor: accent }}
        >
          <span className="text-sm font-semibold uppercase tracking-wide">
            {isReversal ? "Amount reversed" : "Amount received"}
          </span>
          <span className="text-2xl font-bold tabular" style={{ color: accent }}>
            {formatINR(payment.amount_paise)}
          </span>
        </div>
        <p className="mb-6 text-[11px] italic text-gray-700">
          Rupees {amountInWords(payment.amount_paise)} only
        </p>

        <table className="mb-8 w-full text-sm">
          <tbody>
            <Row label="Total fee" value={formatINR(enrolment.net_fee_paise)} />
            <Row label="Paid to date" value={formatINR(paidToDate)} />
            <Row
              label="Balance"
              value={balance > 0 ? formatINR(balance) : "Nil — fee settled in full"}
              strong
            />
          </tbody>
        </table>

        <div className="mt-16 flex items-end justify-between gap-6 text-[11px]">
          <p className="text-gray-600">
            {receipt
              ? `Issued ${formatDateIST(receipt.issued_at, "d MMM yyyy")}`
              : "No receipt number was issued against this entry."}
          </p>
          <div className="w-56 border-t border-gray-500 pt-1 text-center font-semibold">
            Authorised Signatory
          </div>
        </div>

        <DocumentFooter
          brand={brand}
          printedOn={formatDateIST(new Date(), "d MMM yyyy, h:mm a")}
          note={
            brand.documentFooter ??
            "This is a computer-generated receipt. Please retain it for your records."
          }
        />
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr>
      <td className="w-48 py-1.5 align-top text-gray-600">{label}</td>
      <td className={`py-1.5 align-top ${strong ? "font-semibold" : ""}`}>{value}</td>
    </tr>
  );
}
