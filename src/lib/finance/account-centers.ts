import { eq } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { financeAccountCenters } from "@/lib/db/schema";

/**
 * An account belongs to one main centre and may serve others. Every entry
 * posted to it still names one centre, so a centre's reports are true even
 * when one bank account takes everybody's fees.
 */

/** The main centre first, then any it also serves. */
export async function centersServedBy(tx: DbExecutor, accountId: string, mainCenterId: string): Promise<string[]> {
  const extra = await tx
    .select({ centerId: financeAccountCenters.centerId })
    .from(financeAccountCenters)
    .where(eq(financeAccountCenters.accountId, accountId));
  return [mainCenterId, ...extra.map((e) => e.centerId).filter((c) => c !== mainCenterId)];
}

/**
 * The centre to file an entry under. `wanted` is honoured when the account
 * serves it; otherwise the main centre is used, unless `strict`, in which
 * case the caller is told, because filing money under a centre the account
 * does not serve is a mistake worth stopping.
 */
export function pickCenter(served: string[], wanted: string | null | undefined, strict = false): string {
  if (!wanted || served[0] === wanted) return served[0];
  if (served.includes(wanted)) return wanted;
  if (strict) throw new Error("That account is not set up for that centre. Add the centre to the account first.");
  return served[0];
}
