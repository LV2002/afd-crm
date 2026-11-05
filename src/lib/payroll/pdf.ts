import PDFDocument from "pdfkit";

import { ordinal } from "@/lib/hr/leave";

import type { PayrollResult } from "./calc";

/**
 * Payslips as PDF, drawn directly: A4, the same layout as the on-screen slip
 * (navy header, gold title bar, earnings and deductions side by side, a
 * highlighted net pay line, leave and attendance below).
 *
 * "Rs." rather than the rupee sign: the standard PDF fonts have no ₹ glyph,
 * and a missing glyph on a salary slip is worse than the abbreviation.
 */

export interface PdfSlip {
  slipNo: number;
  result: PayrollResult;
  employee: {
    empNo: string;
    name: string;
    designation: string | null;
    department: string | null;
    dateOfJoining: string | null;
    address: string | null;
    pan: string | null;
    bankName: string | null;
    bankAccount: string | null;
    ifsc: string | null;
  };
  company: { name: string; address: string; contactEmail: string; lateAllowance: number; earlyAllowance: number };
  paid?: string | null;
}

const NAVY = "#1f2a44";
const GOLD = "#f2c200";
const TEAL = "#d9f4f4";
const GREY = "#5b6478";

function rs(paise: number): string {
  const neg = paise < 0;
  const rupees = Math.abs(paise) / 100;
  const text = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rupees);
  return `${neg ? "-" : ""}Rs. ${text}`;
}

const monthName = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const dates = (list: string[]) => list.map((d) => ordinal(Number(d.slice(8, 10)))).join(", ") || "-";

function drawSlip(doc: PDFKit.PDFDocument, s: PdfSlip) {
  const r = s.result;
  const left = 40;
  const width = doc.page.width - 80;
  const mid = left + width / 2 + 10;
  const colW = width / 2 - 20;

  // Header
  doc.rect(0, 0, doc.page.width, 64).fill(NAVY);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(16).text(s.company.name, left, 16, { width });
  doc.font("Helvetica").fontSize(8.5).text(s.company.address, left, 38, { width });
  doc.rect(0, 64, doc.page.width, 22).fill(GOLD);
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text(`Payslip - ${monthName(r.month)}`, left, 69, { width });

  // Employee block
  let y = 100;
  const e = s.employee;
  const pair = (label: string, value: string, x: number, yy: number, w: number) => {
    doc.fillColor(GREY).font("Helvetica").fontSize(8).text(label, x, yy, { width: w });
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(9.5).text(value || "-", x, yy + 10, { width: w });
  };
  pair("Employee No.", e.empNo, left, y, colW);
  pair("Date of joining", e.dateOfJoining ?? "-", mid, y, colW);
  pair("Name", e.name, left, y + 30, colW);
  pair("PAN", e.pan ?? "-", mid, y + 30, colW);
  pair("Designation", r.designation ?? e.designation ?? "-", left, y + 60, colW);
  pair("Bank", e.bankName ?? "-", mid, y + 60, colW);
  pair("Department", e.department ?? "-", left, y + 90, colW);
  pair("Account", e.bankAccount ? `${e.bankAccount}${e.ifsc ? `  IFSC ${e.ifsc}` : ""}` : "-", mid, y + 90, colW);
  y += 128;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor("#cfd5e2").stroke();
  y += 10;

  // Earnings | Deductions
  const lines = (x: number, title: string, rows: Array<[string, number]>, totalLabel: string, total: number) => {
    let yy = y;
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(10).text(title, x, yy, { width: colW });
    yy += 18;
    doc.font("Helvetica").fontSize(9);
    for (const [label, value] of rows) {
      doc.fillColor("#111").text(label, x, yy, { width: colW - 80 });
      doc.text(rs(value), x + colW - 90, yy, { width: 90, align: "right" });
      yy += 15;
    }
    doc.moveTo(x, yy).lineTo(x + colW, yy).strokeColor("#cfd5e2").stroke();
    yy += 4;
    doc.font("Helvetica-Bold").text(totalLabel, x, yy, { width: colW - 80 });
    doc.text(rs(total), x + colW - 90, yy, { width: 90, align: "right" });
    return yy + 18;
  };
  const c = r.components;
  const earn: Array<[string, number]> = [["Basic", c.basic], ["HRA", c.hra], ["Other allowance", c.other], ["Medical", c.medical]];
  if (r.lines.overtime > 0) earn.push(["Overtime", r.lines.overtime]);
  if (r.lines.arrears > 0) earn.push(["Arrears", r.lines.arrears]);
  if (r.lines.incentives > 0) earn.push(["Incentives", r.lines.incentives]);
  if (r.lines.bonus > 0) earn.push(["Annual bonus", r.lines.bonus]);
  const ded: Array<[string, number]> = [];
  if (r.lines.insurance > 0) ded.push(["Insurance premium", r.lines.insurance]);
  if (r.lines.advanceRepaid > 0) ded.push(["Advance repaid", r.lines.advanceRepaid]);
  if (r.lines.late > 0) ded.push([`Late coming (${r.late.days.toFixed(4)} days)`, r.lines.late]);
  if (r.lines.early > 0) ded.push([`Early exit (${r.early.days.toFixed(4)} days)`, r.lines.early]);
  if (r.lines.lop > 0) ded.push([`Loss of pay (${r.leave.lopDays} days)`, r.lines.lop]);
  if (ded.length === 0) ded.push(["None", 0]);
  const y1 = lines(left, `Earnings${r.breakupNote ? ` (${r.breakupNote})` : ""}`, earn, "Total earnings", r.earnings);
  const y2 = lines(mid, "Deductions", ded, "Total deductions", r.deductions);
  y = Math.max(y1, y2) + 4;

  // Net pay
  doc.rect(left, y, width, 28).fill(TEAL);
  doc.fillColor("#111").font("Helvetica-Bold").fontSize(12).text("Net pay", left + 10, y + 8, { width: width / 2 });
  doc.text(rs(r.net), left + width / 2, y + 8, { width: width / 2 - 10, align: "right" });
  y += 40;
  if (s.paid) {
    doc.fillColor(GREY).font("Helvetica").fontSize(8.5).text(s.paid, left, y, { width });
    y += 16;
  }

  // Leave and attendance
  doc.fillColor("#111").font("Helvetica-Bold").fontSize(10).text("Leave and advance", left, y, { width: colW });
  doc.text("Attendance", mid, y, { width: colW });
  let yl = y + 18;
  let yr = y + 18;
  doc.font("Helvetica").fontSize(9);
  const row = (x: number, yy: number, label: string, value: string, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor("#111").text(label, x, yy, { width: colW - 110 });
    doc.text(value, x + colW - 120, yy, { width: 120, align: "right" });
    return yy + 14;
  };
  yl = row(left, yl, "Sick leave balance", String(r.leave.slClosing));
  yl = row(left, yl, "Casual leave balance", String(r.leave.clClosing));
  if (r.advance.broughtForward > 0 || r.advance.given > 0 || r.advance.closing > 0) {
    yl = row(left, yl, "Advance brought forward", rs(r.advance.broughtForward));
    yl = row(left, yl, "Advance given", rs(r.advance.given));
    yl = row(left, yl, "Advance repaid", rs(r.advance.repaid));
    yl = row(left, yl, "Advance outstanding", rs(r.advance.closing), true);
  }
  const paidDates = (types: string[]) => r.leave.treated.filter((t) => types.includes(t.treatedAs)).map((t) => t.date);
  const att: Array<[string, string]> = [
    ["Sick / casual leave", dates(paidDates(["paid_sick", "paid_casual"]))],
    ["Loss of pay", dates(paidDates(["lop"]))],
    ["Half days", dates(paidDates(["half_day"]))],
    ["Miss punch", dates(r.leave.miss)],
    [`Early exits (${s.company.earlyAllowance}m free)`, dates(r.early.dates)],
    [`Late coming (${s.company.lateAllowance}m free)`, dates(r.late.dates)],
  ];
  for (const [label, value] of att) {
    doc.font("Helvetica").fillColor("#111").text(label, mid, yr, { width: 120 });
    doc.text(value, mid + 125, yr, { width: colW - 125 });
    yr += Math.max(14, doc.heightOfString(value, { width: colW - 125 }) + 2);
  }
  if (r.late.totalMinutes > 0) {
    doc.fillColor(GREY).text(`Late coming: ${r.late.totalMinutes} min total, ${r.late.excessMinutes} above free`, mid, yr, { width: colW });
    yr += 14;
  }
  if (r.early.totalMinutes > 0) {
    doc.fillColor(GREY).text(`Early exit: ${r.early.totalMinutes} min total, ${r.early.excessMinutes} above free`, mid, yr, { width: colW });
    yr += 14;
  }

  // Footer
  const fy = doc.page.height - 70;
  doc.moveTo(left, fy).lineTo(left + width, fy).strokeColor("#cfd5e2").stroke();
  doc.fillColor(GREY).font("Helvetica").fontSize(8).text(`For any clarifications email to: ${s.company.contactEmail}`, left, fy + 8, { width });
  doc.text("This is a computer generated payslip and doesn't need a signature", left, fy + 20, { width });
  doc.text(`Slip #${s.slipNo}`, left, fy + 20, { width, align: "right" });
}

/** One PDF holding one or many payslips, a page each. */
export function renderPayslips(slips: PdfSlip[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: "Payslip" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  slips.forEach((s, i) => {
    if (i > 0) doc.addPage();
    drawSlip(doc, s);
  });
  doc.end();
  return done;
}
