import { and, eq, inArray, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { attendancePunches, employees } from "@/lib/db/schema";

import type { Punch } from "./parse";

export const MAX_PUNCHES_PER_REQUEST = 20_000;

export interface IngestResult {
  received: number;
  added: number;
  /** Device codes that belong to nobody yet. */
  unmapped: string[];
}

/**
 * Stores punches. Each is kept even when its code belongs to nobody yet (the
 * person may be mapped next week), and a punch seen before is not stored twice.
 */
export async function ingestPunches(
  tx: DbExecutor,
  punches: Punch[],
  meta: { source: "device" | "relay" | "csv"; serial?: string | null },
): Promise<IngestResult> {
  if (punches.length === 0) return { received: 0, added: 0, unmapped: [] };
  if (punches.length > MAX_PUNCHES_PER_REQUEST) throw new Error(`At most ${MAX_PUNCHES_PER_REQUEST} punches at a time.`);

  const codes = [...new Set(punches.map((p) => p.code))];
  const known = await tx
    .select({ id: employees.id, code: employees.biometricCode })
    .from(employees)
    .where(and(inArray(employees.biometricCode, codes), isNull(employees.deletedAt)));
  const byCode = new Map(known.map((k) => [k.code as string, k.id]));

  let added = 0;
  for (let i = 0; i < punches.length; i += 1000) {
    const inserted = await tx
      .insert(attendancePunches)
      .values(
        punches.slice(i, i + 1000).map((p) => ({
          deviceCode: p.code,
          employeeId: byCode.get(p.code) ?? null,
          punchedAt: p.at,
          deviceSerial: meta.serial ?? "",
          source: meta.source,
          raw: { code: p.code, at: p.at.toISOString() },
        })),
      )
      .onConflictDoNothing()
      .returning({ id: attendancePunches.id });
    added += inserted.length;
  }
  return { received: punches.length, added, unmapped: codes.filter((c) => !byCode.has(c)) };
}

/** Gives a device code to an employee, and claims the punches that were waiting for it. */
export async function mapCode(
  tx: DbExecutor,
  input: { code: string; employeeId: string },
): Promise<{ ok: true; claimed: number } | { ok: false; error: string }> {
  const code = input.code.trim();
  if (!code) return { ok: false, error: "Which code?" };
  const [other] = await tx
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(eq(employees.biometricCode, code), isNull(employees.deletedAt)));
  if (other && other.id !== input.employeeId) return { ok: false, error: `Code ${code} already belongs to ${other.name}.` };
  await tx.update(employees).set({ biometricCode: code, updatedAt: new Date() }).where(eq(employees.id, input.employeeId));
  const claimed = await tx
    .update(attendancePunches)
    .set({ employeeId: input.employeeId })
    .where(and(eq(attendancePunches.deviceCode, code), isNull(attendancePunches.employeeId)))
    .returning({ id: attendancePunches.id });
  return { ok: true, claimed: claimed.length };
}

