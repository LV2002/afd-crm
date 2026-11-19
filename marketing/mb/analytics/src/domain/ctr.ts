// Typical share of searchers who click a result at each position on Google (rounded industry averages). Used only to size an
// opportunity, always shown as an estimate: real rates differ by search, device and what else is on the results page.
const BY_POSITION = [0.28, 0.15, 0.11, 0.08, 0.065, 0.05, 0.04, 0.032, 0.027, 0.023];
const BEYOND_PAGE_ONE = 0.008;

export function expectedCtr(position: number): number {
  const slot = Math.round(position);
  return slot < 1 ? BY_POSITION[0] ?? 0 : BY_POSITION[slot - 1] ?? BEYOND_PAGE_ONE;
}
