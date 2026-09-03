import { notFound } from "next/navigation";

import { PrintButton } from "@/app/(app)/students/[id]/print/print-button";
import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getLeadFeePlan } from "@/lib/enrolment/get-fee-plan";
import { formatINR } from "@/lib/format/currency";
import { formatDateIST } from "@/lib/format/date";
import { getLeadDetail } from "@/lib/leads/get-lead-detail";
import { A4_LANDSCAPE_CSS } from "@/lib/print/page-css";
import { createClient } from "@/lib/supabase/server";

/**
 * The printable instalment agreement, matching AFD's real form
 * (installment_agreement_a5.pdf): landscape A5, two columns, numbered
 * sections, blue accents.
 *
 * Rendered from the saved plan rather than from what is on screen, so the
 * paper a student signs and the record the CRM holds cannot diverge.
 *
 * Printed on A4 landscape rather than the original's A5: A4 is the paper
 * AFD's offices have, and this sheet is printed, signed by hand and
 * scanned back in — see lib/print/page-css.ts.
 *
 * Two deliberate departures from the paper original, both because the
 * original is a blank to be filled by hand and this one is printed
 * already complete:
 *  - It prints FOUR instalment rows where the paper has three, because
 *    Leon asked for four slots. Unused rows are still drawn, so a plan
 *    with fewer instalments looks like the familiar form.
 *  - The Receipt No column stays blank: a receipt number is issued by the
 *    accounts ledger when money actually arrives, not when the plan is
 *    agreed, so pre-filling it would be inventing one.
 */

const ACCENT = "#2c5aa0";

function SectionHeading({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <h2
      className="mb-2 flex items-center gap-2 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white"
      style={{ background: ACCENT }}
    >
      <span>
        {number}. {children}
      </span>
    </h2>
  );
}

/** A labelled line with a dotted rule, as on the paper form. */
function FieldLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span className="w-32 shrink-0 font-semibold" style={{ color: ACCENT }}>
        {label}
      </span>
      <span className="flex-1 border-b border-dotted border-gray-400 pb-0.5">{value || " "}</span>
    </div>
  );
}

export default async function InstalmentAgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !can(user, "enrolment.read")) return <AccessDenied />;

  const supabase = await createClient();
  const detail = await getLeadDetail(supabase, id);
  if (!detail) notFound();

  const plan = await getLeadFeePlan(id);
  if (!plan.hasEnrolment) notFound();

  const { row, centerName } = detail;
  const toPaise = (v: string) => Math.round(Number(v || 0) * 100);

  // Four rows always drawn, so an agreement with two instalments still
  // looks like the form everyone recognises.
  const instalmentBySeq = new Map(plan.values.instalments.map((i) => [i.sequence, i]));
  const ordinals = ["1st", "2nd", "3rd", "4th"];

  const parentName = [row.father_name, row.mother_name].filter(Boolean).join(" / ");
  const year = new Date().getFullYear();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: A4_LANDSCAPE_CSS }} />
      <div className="mx-auto max-w-[297mm] bg-white p-6 text-black print:p-0">
        <div className="no-print">
          <PrintButton />
        </div>

        <header
          className="mb-3 flex items-end justify-between border-b-2 pb-2"
          style={{ borderColor: ACCENT }}
        >
          <div>
            <div
              className="inline-block px-2 py-1 text-sm font-extrabold tracking-tight text-white"
              style={{ background: "#111" }}
            >
              afdindia
            </div>
            <p className="mt-0.5 text-[8px] uppercase tracking-wider text-gray-600">
              gateway to global design schools
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-lg font-bold uppercase" style={{ color: ACCENT }}>
              Installment Payment Agreement
            </h1>
            <p className="text-[10px] text-gray-600">
              Form No: AFD/FEE/{year}/{String(row.lead_number).padStart(6, "0")}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-5">
          {/* Left column: who, and what they owe. */}
          <div>
            <SectionHeading number={1}>Student &amp; Course Information</SectionHeading>
            <div className="mb-4 flex flex-col gap-1.5">
              <FieldLine label="Student Name:" value={row.student_name} />
              <FieldLine label="Roll No / Ref:" value={`Lead #${row.lead_number}`} />
              <FieldLine label="Course Name:" value={String(row.courses_interested ?? "")} />
              <FieldLine label="Center / Branch:" value={centerName ?? ""} />
              <FieldLine label="Parent / Guardian:" value={parentName} />
              <FieldLine label="Contact Number:" value={row.primary_phone} />
            </div>

            <SectionHeading number={2}>Fee Summary &amp; Payment Schedule</SectionHeading>
            <div className="mb-2 flex flex-col gap-1.5">
              <FieldLine
                label="Total Course Fee:"
                value={`₹ ${formatINR(toPaise(plan.values.courseFee)).replace("₹", "").trim()}`}
              />
              {plan.values.discountName && (
                <FieldLine
                  label="Discount:"
                  value={`₹ ${formatINR(toPaise(plan.values.discount)).replace("₹", "").trim()} (${plan.values.discountName})`}
                />
              )}
              <FieldLine
                label="Down Payment Paid:"
                value={`₹ ${formatINR(toPaise(plan.values.downPayment)).replace("₹", "").trim()}`}
              />
            </div>

            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="text-white" style={{ background: ACCENT }}>
                  <th className="border border-gray-400 p-1 text-left">INST.</th>
                  <th className="border border-gray-400 p-1 text-left">DUE DATE</th>
                  <th className="border border-gray-400 p-1 text-right">AMOUNT (₹)</th>
                  <th className="border border-gray-400 p-1 text-center">RECEIPT NO</th>
                </tr>
              </thead>
              <tbody>
                {ordinals.map((ordinal, index) => {
                  const instalment = instalmentBySeq.get(index + 1);
                  return (
                    <tr key={ordinal} className={index % 2 === 1 ? "bg-gray-50" : undefined}>
                      <td className="border border-gray-400 p-1 font-semibold">{ordinal}</td>
                      <td className="border border-gray-400 p-1">
                        {instalment ? formatDateIST(`${instalment.dueDate}T00:00:00Z`, "d MMM yyyy") : " "}
                      </td>
                      <td className="border border-gray-400 p-1 text-right">
                        {instalment
                          ? formatINR(toPaise(instalment.amount)).replace("₹", "").trim()
                          : " "}
                      </td>
                      {/* Blank: a receipt number is issued by the ledger when
                          money arrives, not when the plan is agreed. */}
                      <td className="border border-gray-400 p-1">&nbsp;</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {plan.values.feeNotes && (
              <p className="mt-2 text-[9px] leading-snug">
                <span className="font-semibold" style={{ color: ACCENT }}>
                  Notes:{" "}
                </span>
                {plan.values.feeNotes}
              </p>
            )}
          </div>

          {/* Right column: the terms and the signatures. */}
          <div className="border-l border-dashed border-gray-300 pl-5">
            <SectionHeading number={3}>Terms &amp; Payment Conditions</SectionHeading>
            <ol className="mb-4 list-decimal space-y-2 pl-4 text-[10px] leading-snug">
              <li>
                <span className="font-bold">Due Dates &amp; Grace Period:</span> Installment payments
                must be cleared on or before the specified due dates. A 5-day grace period is
                permitted.
              </li>
              <li>
                <span className="font-bold">Late Fee Penalty:</span> A late payment fee of{" "}
                <span className="font-bold">₹100 per day</span> will apply automatically after the
                grace period until the balance is settled.
              </li>
              <li>
                <span className="font-bold">Suspension of Services:</span> Non-payment exceeding 15
                calendar days from the due date may result in temporary suspension of attending
                classes and portal access.
              </li>
              <li>
                <span className="font-bold">Non-Refundable Policy:</span> Course fees once agreed
                upon and paid are strictly non-refundable and non-transferable under any
                circumstances.
              </li>
              <li>
                <span className="font-bold">Declaration:</span> I hereby agree to strictly adhere to
                the payment schedule detailed herein and abide by all institutional financial
                policies.
              </li>
            </ol>

            <SectionHeading number={4}>Authorization &amp; Signatures</SectionHeading>
            <div className="mt-16 flex items-end justify-between gap-4 text-[10px]">
              <div className="flex-1 border-t border-gray-500 pt-1 text-center font-bold">
                Student
              </div>
              <div className="flex-1 border-t border-gray-500 pt-1 text-center font-bold">
                Parent / Guardian
              </div>
              <div className="flex-1 border-t border-gray-500 pt-1 text-center font-bold">
                Authorized Signatory
              </div>
            </div>
            <p className="mt-4 text-center text-[10px] text-gray-600">
              Date: ____ / ____ / {year} &nbsp;|&nbsp; Place: ____________________
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
