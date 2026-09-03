/**
 * Pure helpers for an instalment plan. No database, so the arithmetic that
 * decides what a student owes is testable on its own — this is the part
 * that must not be wrong.
 */

export interface InstalmentInput {
  sequence: number;
  dueDate: string;
  amountPaise: number;
}

export interface PlanTotals {
  totalFeePaise: number;
  discountPaise: number;
  netFeePaise: number;
  scheduledPaise: number;
  /** net - scheduled. Positive means the plan doesn't cover the fee. */
  unscheduledPaise: number;
  isFullyScheduled: boolean;
}

/**
 * Money is in paise as integers throughout (CLAUDE.md § Conventions), so
 * these sums are exact. A float would drift by fractions of a rupee across
 * four instalments and make an agreement that doesn't add up.
 */
export function planTotals(
  totalFeePaise: number,
  discountPaise: number,
  instalments: InstalmentInput[],
): PlanTotals {
  const netFeePaise = totalFeePaise - discountPaise;
  const scheduledPaise = instalments.reduce((sum, i) => sum + i.amountPaise, 0);
  return {
    totalFeePaise,
    discountPaise,
    netFeePaise,
    scheduledPaise,
    unscheduledPaise: netFeePaise - scheduledPaise,
    isFullyScheduled: netFeePaise === scheduledPaise,
  };
}

export type PlanProblem = string;

/**
 * Validates a plan a counsellor is about to save.
 *
 * Deliberately does NOT require the instalments to add up to the net fee.
 * A part-scheduled plan is a real situation — a student pays something now
 * and the rest is agreed later — and refusing to save it would push
 * counsellors into entering a fake instalment. The UI shows the shortfall
 * instead, so it is visible rather than enforced.
 */
export function validatePlan(
  totalFeePaise: number,
  discountPaise: number,
  instalments: InstalmentInput[],
): PlanProblem[] {
  const problems: PlanProblem[] = [];

  if (!Number.isInteger(totalFeePaise) || totalFeePaise <= 0) {
    problems.push("Enter the course fee.");
  }
  if (!Number.isInteger(discountPaise) || discountPaise < 0) {
    problems.push("Discount can't be negative.");
  }
  if (discountPaise > totalFeePaise) {
    problems.push("Discount can't be more than the course fee.");
  }

  const seen = new Set<number>();
  for (const instalment of instalments) {
    if (seen.has(instalment.sequence)) {
      problems.push(`Instalment ${instalment.sequence} is listed twice.`);
    }
    seen.add(instalment.sequence);

    if (!Number.isInteger(instalment.amountPaise) || instalment.amountPaise <= 0) {
      problems.push(`Instalment ${instalment.sequence} needs an amount.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(instalment.dueDate)) {
      problems.push(`Instalment ${instalment.sequence} needs a due date.`);
    }
  }

  const scheduled = instalments.reduce((sum, i) => sum + i.amountPaise, 0);
  if (scheduled > totalFeePaise - discountPaise) {
    // This one IS an error: scheduling more than is owed is always a typo,
    // and letting it through would print an agreement overcharging a student.
    problems.push("The instalments add up to more than the amount payable.");
  }

  return problems;
}

/**
 * Rupees (what a counsellor types) to paise (what is stored). Accepts
 * "45,000", "45000.50", " 45000 ". Returns null for anything else so the
 * caller can report it rather than silently storing a zero.
 */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[,\s₹]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  // Round rather than truncate: 0.1 + 0.2 style float error in the
  // multiplication would otherwise lose a paisa on some inputs.
  return Math.round(Number(cleaned) * 100);
}
