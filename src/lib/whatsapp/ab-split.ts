/**
 * Splitting an audience between two versions of a message.
 *
 * Random, so neither version is given the people who happen to sit first in
 * the list (newest leads, one centre). Seedable so the split can be tested
 * and, if ever needed, reproduced. Halves differ by at most one person.
 */
export function assignVariants(count: number, random: () => number = Math.random): Array<"a" | "b"> {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const variants: Array<"a" | "b"> = new Array(count).fill("a");
  order.slice(Math.ceil(count / 2)).forEach((index) => {
    variants[index] = "b";
  });
  return variants;
}

/** How many `{{n}}` blanks a template body has. A and B must match: both are filled from the same values. */
export function blankCount(body: string): number {
  const numbers = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return numbers.length ? Math.max(...numbers) : 0;
}
