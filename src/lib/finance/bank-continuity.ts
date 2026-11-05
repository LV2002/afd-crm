import { eq, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { bankStatementLines } from "@/lib/db/schema";

import type { StatementLine } from "./bank-statement";

/**
 * Checks that a statement being uploaded fits with the ones already stored.
 *
 * The person who uploads statements is also the person who keeps the books,
 * so the upload itself has to be hard to bend. Two things that would let a
 * doctored file through are ruled out here, using the bank's own running
 * balances:
 *
 *  1. **A missing stretch.** A new statement starts after the last stored
 *     line, so the balance it opens with must equal the balance the last
 *     statement closed on. If lines (or a whole month) were left out, the
 *     balances do not join.
 *  2. **Rewriting history.** A line dated before the last stored date that
 *     the system has never seen means an earlier period is being changed;
 *     bank history does not change. Lines on the last stored date itself are
 *     allowed, because a statement downloaded mid-day gains lines later.
 *
 * Lines without a balance cannot be checked and are let through; so is an
 * account with nothing stored yet.
 */

/** Oldest first, whichever way the file was listed. */
export function chronological<T extends { occurredOn: string }>(lines: T[]): T[] {
  if (lines.length < 2) return lines;
  return lines[0].occurredOn > lines[lines.length - 1].occurredOn ? [...lines].reverse() : lines;
}

type Checkable = Pick<StatementLine, "occurredOn" | "direction" | "amountPaise" | "balancePaise" | "fingerprint">;

export async function checkContinuity(
  tx: DbExecutor,
  accountId: string,
  lines: Checkable[],
): Promise<string | null> {
  if (lines.length === 0 || lines.some((l) => l.balancePaise === null)) return null;

  const [last] = await tx
    .select({ occurredOn: bankStatementLines.occurredOn, balancePaise: bankStatementLines.balancePaise })
    .from(bankStatementLines)
    .where(eq(bankStatementLines.accountId, accountId))
    .orderBy(
      sql`${bankStatementLines.occurredOn} desc`,
      sql`${bankStatementLines.importedAt} desc`,
      sql`${bankStatementLines.seq} desc nulls last`,
    )
    .limit(1);
  if (!last || last.balancePaise === null) return null;

  const known = new Set(
    (
      await tx
        .select({ fingerprint: bankStatementLines.fingerprint })
        .from(bankStatementLines)
        .where(eq(bankStatementLines.accountId, accountId))
    ).map((r) => r.fingerprint),
  );
  const fresh = lines.filter((l) => !known.has(l.fingerprint));
  if (fresh.length === 0) return null;

  const ordered = chronological(lines);
  const first = ordered[0];

  if (first.occurredOn > last.occurredOn) {
    const opening = (first.balancePaise as number) - (first.direction === "in" ? first.amountPaise : -first.amountPaise);
    if (opening !== last.balancePaise) {
      return `This statement opens with a balance of ₹${(opening / 100).toLocaleString("en-IN")}, but the last statement imported for this account closed on ₹${(last.balancePaise / 100).toLocaleString("en-IN")} (${last.occurredOn}). Something between them is missing or has been changed. Upload the statement that covers ${last.occurredOn} onwards.`;
    }
    return null;
  }

  const rewrites = fresh.filter((l) => l.occurredOn < last.occurredOn);
  if (rewrites.length > 0) {
    return `${rewrites.length} line${rewrites.length === 1 ? "" : "s"} in this statement fall on dates that were already imported (before ${last.occurredOn}) but don't match what was imported then. A bank statement doesn't change after the fact, so either this file or the earlier one is wrong.`;
  }
  return null;
}
