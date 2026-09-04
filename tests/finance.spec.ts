/**
 * The finance module's arithmetic.
 *
 * This is a ledger. A balance out by a rupee is a balance nobody trusts,
 * and an institute that stops trusting its own numbers goes back to the
 * spreadsheet. Everything covered here is pure — no database, no clock —
 * so the sums that tell AFD what is in the bank and who owes them money
 * are checked on every run.
 */
import { describe, expect, it } from "vitest";

import { allocatePayments, studentStanding } from "../src/lib/finance/allocate";
import {
  accountBalance,
  ageingBucket,
  categoryBreakdown,
  daysLate,
  fiscalMonths,
  gstComponent,
  isPettyCashLow,
  monthBounds,
  periodTotals,
  runningBalances,
  signedAmount,
  timelinessSummary,
} from "../src/lib/finance/ledger-math";

const IN = (amountPaise: number) => ({ direction: "in" as const, amountPaise });
const OUT = (amountPaise: number) => ({ direction: "out" as const, amountPaise });
const TRANSFER_IN = (amountPaise: number) => ({ direction: "transfer_in" as const, amountPaise });
const TRANSFER_OUT = (amountPaise: number) => ({ direction: "transfer_out" as const, amountPaise });

describe("what one entry does to a balance", () => {
  it("adds money in and subtracts money out", () => {
    expect(signedAmount(IN(50000))).toBe(50000);
    expect(signedAmount(OUT(50000))).toBe(-50000);
  });

  it("treats the two legs of a transfer as an ordinary in and out", () => {
    expect(signedAmount(TRANSFER_IN(50000))).toBe(50000);
    expect(signedAmount(TRANSFER_OUT(50000))).toBe(-50000);
  });

  it("flips automatically for a reversal, because the amount is negative", () => {
    // This is the whole mechanism. A reversal is not a status change, it
    // is a mirrored row, and the pair cancels with no special case.
    expect(signedAmount(IN(50000)) + signedAmount(IN(-50000))).toBe(0);
    expect(signedAmount(OUT(50000)) + signedAmount(OUT(-50000))).toBe(0);
  });
});

describe("account balance", () => {
  it("is the opening balance plus everything the ledger says", () => {
    expect(accountBalance(1_000_00, [IN(500_00), OUT(200_00)])).toBe(1_300_00);
  });

  it("returns to where it was after a reversal", () => {
    const before = accountBalance(1_000_00, [IN(500_00)]);
    const after = accountBalance(1_000_00, [IN(500_00), IN(-500_00)]);
    expect(after).toBe(before - 500_00);
    expect(after).toBe(1_000_00);
  });

  it("can go negative, and says so rather than clamping", () => {
    // An overdrawn cash box is a real state that wants looking at, not
    // one to hide behind a Math.max.
    expect(accountBalance(0, [OUT(100_00)])).toBe(-100_00);
  });

  it("runs a statement down the page", () => {
    expect(runningBalances(1_000_00, [IN(500_00), OUT(200_00), IN(50_00)])).toEqual([
      1_500_00,
      1_300_00,
      1_350_00,
    ]);
  });
});

describe("period totals", () => {
  it("separates income from expenses and nets them", () => {
    expect(periodTotals([IN(100_00), IN(50_00), OUT(30_00)])).toEqual({
      inPaise: 150_00,
      outPaise: 30_00,
      netPaise: 120_00,
    });
  });

  it("leaves transfers out of BOTH sides", () => {
    // The most important rule in the module. Moving ₹50,000 from the bank
    // to the cash box is not income and not an expense — counting it
    // would inflate both halves of every report.
    const withTransfer = periodTotals([
      IN(100_00),
      TRANSFER_OUT(50_00),
      TRANSFER_IN(50_00),
      OUT(30_00),
    ]);
    expect(withTransfer).toEqual({ inPaise: 100_00, outPaise: 30_00, netPaise: 70_00 });
  });

  it("nets a reversed expense back out of the total", () => {
    expect(periodTotals([OUT(100_00), OUT(-100_00)]).outPaise).toBe(0);
  });
});

describe("GST memo", () => {
  it("back-calculates the tax already inside a gross collection", () => {
    // ₹1,18,000 gross at 18% contains ₹18,000 of GST — NOT ₹21,240.
    // Getting this backwards overstates the liability by the rate
    // squared, on a number a CA will look at.
    expect(gstComponent(118_000_00, 0.18)).toBe(18_000_00);
  });

  it("leaves the net at the pre-tax figure", () => {
    const gross = 118_000_00;
    expect(gross - gstComponent(gross, 0.18)).toBe(100_000_00);
  });

  it("is zero when no rate is set", () => {
    expect(gstComponent(100_000_00, 0)).toBe(0);
  });
});

describe("the financial year", () => {
  it("runs April to March for an Indian institute", () => {
    const months = fiscalMonths(2026, 4);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-04");
    expect(months[11]).toBe("2027-03");
  });

  it("runs January to December when configured that way", () => {
    const months = fiscalMonths(2026, 1);
    expect(months[0]).toBe("2026-01");
    expect(months[11]).toBe("2026-12");
  });

  it("knows how long each month is, February included", () => {
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds("2026-04")).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });
});

describe("category breakdown", () => {
  const entries = [
    { category: "Rent", amountPaise: 50_000_00 },
    { category: "Salaries", amountPaise: 200_000_00 },
    { category: "Salaries", amountPaise: 100_000_00 },
    { category: "Something An Admin Deleted", amountPaise: 7_000_00 },
  ];

  it("totals each known category", () => {
    const result = categoryBreakdown(entries, ["Salaries", "Rent"]);
    expect(result.rows).toEqual([
      { category: "Salaries", totalPaise: 300_000_00 },
      { category: "Rent", totalPaise: 50_000_00 },
    ]);
  });

  it("shows money in no listed category rather than losing it", () => {
    // Without this line, renaming a category in Settings would quietly
    // drop its money out of the breakdown while the total stayed right,
    // and the report would disagree with itself with nothing on screen.
    const result = categoryBreakdown(entries, ["Salaries", "Rent"]);
    expect(result.uncategorisedPaise).toBe(7_000_00);
    expect(
      result.rows.reduce((sum, r) => sum + r.totalPaise, 0) + result.uncategorisedPaise,
    ).toBe(result.totalPaise);
  });

  it("lists a category with nothing in it as zero", () => {
    const result = categoryBreakdown(entries, ["Salaries", "Printing"]);
    expect(result.rows).toContainEqual({ category: "Printing", totalPaise: 0 });
  });
});

describe("petty cash float", () => {
  it("flags a box below a fifth of its float", () => {
    expect(isPettyCashLow(900_00, 5_000_00)).toBe(true);
    expect(isPettyCashLow(1_100_00, 5_000_00)).toBe(false);
  });

  it("never flags an account with no float set", () => {
    expect(isPettyCashLow(0, null)).toBe(false);
    expect(isPettyCashLow(0, 0)).toBe(false);
  });
});

describe("allocating payments to instalments", () => {
  const schedule = [
    { id: "i1", sequence: 1, dueDate: "2026-01-10", amountPaise: 20_000_00 },
    { id: "i2", sequence: 2, dueDate: "2026-02-10", amountPaise: 20_000_00 },
    { id: "i3", sequence: 3, dueDate: "2026-03-10", amountPaise: 20_000_00 },
  ];

  it("fills the oldest unpaid instalment first", () => {
    const result = allocatePayments(
      schedule,
      [{ id: "p1", receivedOn: "2026-01-09", amountPaise: 30_000_00 }],
      "2026-01-15",
    );

    expect(result.instalments[0].outstandingPaise).toBe(0);
    expect(result.instalments[1].paidPaise).toBe(10_000_00);
    expect(result.instalments[2].paidPaise).toBe(0);
    expect(result.outstandingPaise).toBe(30_000_00);
  });

  it("dates a settlement by the payment that completed it", () => {
    const result = allocatePayments(
      schedule,
      [
        { id: "p1", receivedOn: "2026-01-05", amountPaise: 5_000_00 },
        { id: "p2", receivedOn: "2026-01-20", amountPaise: 15_000_00 },
      ],
      "2026-02-01",
    );

    // Part-paid early, finished late: the instalment was settled on the
    // 20th, and it is ten days late.
    expect(result.instalments[0].settledOn).toBe("2026-01-20");
    expect(daysLate({ dueDate: "2026-01-10", settledOn: "2026-01-20" })).toBe(10);
  });

  it("un-settles an instalment when its payment is reversed", () => {
    // No cleanup step and no allocation rows to unwind — the reversing
    // payment is negative, so it simply reduces the pot.
    const result = allocatePayments(
      schedule,
      [
        { id: "p1", receivedOn: "2026-01-09", amountPaise: 20_000_00 },
        { id: "p1r", receivedOn: "2026-01-11", amountPaise: -20_000_00 },
      ],
      "2026-01-15",
    );

    expect(result.instalments[0].outstandingPaise).toBe(20_000_00);
    expect(result.instalments[0].status).toBe("overdue");
    expect(result.paidPaise).toBe(0);
  });

  it("reports a surplus rather than silently absorbing it", () => {
    const result = allocatePayments(
      schedule,
      [{ id: "p1", receivedOn: "2026-01-09", amountPaise: 70_000_00 }],
      "2026-01-15",
    );

    expect(result.surplusPaise).toBe(10_000_00);
    expect(studentStanding(result)).toBe("overpaid");
  });

  it("marks only the instalments whose date has actually passed", () => {
    // As of 1 February: #1 (due 10 Jan) is late, #2 (due 10 Feb) is nine
    // days off so it is neither late nor inside the seven-day warning,
    // and #3 is further out still. One overdue row is enough to make the
    // student overdue overall.
    const result = allocatePayments(schedule, [], "2026-02-01");
    expect(result.instalments[0].status).toBe("overdue");
    expect(result.instalments[1].status).toBe("upcoming");
    expect(result.instalments[2].status).toBe("upcoming");
    expect(studentStanding(result)).toBe("overdue");
  });

  it("warns a week before a payment is due", () => {
    const result = allocatePayments(schedule, [], "2026-01-05");
    expect(result.instalments[0].status).toBe("due_soon");
    expect(result.instalments[2].status).toBe("upcoming");
    expect(studentStanding(result)).toBe("on_track");
  });

  it("calls a fully-settled schedule paid", () => {
    const result = allocatePayments(
      schedule,
      [{ id: "p1", receivedOn: "2026-01-09", amountPaise: 60_000_00 }],
      "2026-04-01",
    );
    expect(result.outstandingPaise).toBe(0);
    expect(studentStanding(result)).toBe("paid");
  });
});

describe("timeliness", () => {
  it("counts paying early as on time, never as credit", () => {
    expect(daysLate({ dueDate: "2026-01-10", settledOn: "2026-01-01" })).toBe(0);
    expect(daysLate({ dueDate: "2026-01-10", settledOn: "2026-01-10" })).toBe(0);
  });

  it("has no answer for an unsettled instalment", () => {
    expect(daysLate({ dueDate: "2026-01-10", settledOn: null })).toBeNull();
  });

  it("averages the delay over the LATE ones only", () => {
    // Averaging in every on-time zero flatters the number into
    // meaninglessness — two payments 10 and 20 days late average 15, not
    // 7.5 because two others were punctual.
    const summary = timelinessSummary([
      { dueDate: "2026-01-10", settledOn: "2026-01-10" },
      { dueDate: "2026-01-10", settledOn: "2026-01-09" },
      { dueDate: "2026-01-10", settledOn: "2026-01-20" },
      { dueDate: "2026-01-10", settledOn: "2026-01-30" },
    ]);

    expect(summary.settled).toBe(4);
    expect(summary.onTime).toBe(2);
    expect(summary.late).toBe(2);
    expect(summary.onTimeRate).toBe(0.5);
    expect(summary.averageDaysLate).toBe(15);
    expect(summary.worstDaysLate).toBe(20);
  });

  it("says nothing rather than 0% when nothing has settled", () => {
    // "0% on time" and "nobody has paid yet" are different facts and must
    // not render the same.
    const summary = timelinessSummary([{ dueDate: "2026-01-10", settledOn: null }]);
    expect(summary.settled).toBe(0);
    expect(summary.onTimeRate).toBeNull();
    expect(summary.averageDaysLate).toBeNull();
  });
});

describe("ageing", () => {
  it("buckets by how overdue, not just whether", () => {
    expect(ageingBucket("2026-03-01", "2026-02-01")).toBe("current");
    expect(ageingBucket("2026-01-15", "2026-02-01")).toBe("1-30");
    expect(ageingBucket("2026-01-01", "2026-02-15")).toBe("31-60");
    expect(ageingBucket("2025-11-01", "2026-02-01")).toBe("60+");
  });

  it("treats the due date itself as current", () => {
    expect(ageingBucket("2026-02-01", "2026-02-01")).toBe("current");
  });
});
