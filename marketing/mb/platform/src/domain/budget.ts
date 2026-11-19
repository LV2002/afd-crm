// Money is whole micro-dollars (1 USD = 1,000,000) so sums never drift.
export const MICRO_PER_USD = 1_000_000;
export const usdToMicro = (usd: number): number => Math.round(usd * MICRO_PER_USD);
export const microToUsd = (micro: number): number => micro / MICRO_PER_USD;

const IST_OFFSET_MS = 330 * 60_000;

// The budget month follows India time: it starts at 00:00 IST on the 1st. Returned as UTC instants.
export function istMonthRange(at: Date): { readonly start: Date; readonly end: Date } {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(year, month + 1, 1) - IST_OFFSET_MS),
  };
}
