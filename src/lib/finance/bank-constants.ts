/**
 * Money on a bank statement that is neither income nor an expense, so it gets
 * no ledger row of its own. Student fees are the common case: the fee ledger
 * already recorded them when the counsellor took the payment, and posting
 * them again from the bank line would count the same rupees twice.
 */
export const SKIP_REASONS: Record<string, string> = {
  student_fee: "Student fee — already in the fee ledger",
  own_transfer: "Transfer between our own accounts",
  other: "Not income or an expense",
};

export const SKIP_OPTIONS = Object.entries(SKIP_REASONS).map(([key, label]) => ({
  value: `skip:${key}`,
  label,
}));
