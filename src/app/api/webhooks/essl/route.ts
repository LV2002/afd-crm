import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { ingestPunches, MAX_PUNCHES_PER_REQUEST } from "@/lib/attendance/ingest";
import { parsePunchTime, type Punch } from "@/lib/attendance/parse";
import { db } from "@/lib/db/client";
import { payrollSettings } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Receives biometric punches from a small relay running next to the eSSL
 * software (or any script that can read its log), as JSON:
 *
 *   { "punches": [ { "code": "10085", "time": "2026-11-03 09:41:05" } ] }
 *
 * The caller proves itself with `Authorization: Bearer <key>`; only the hash
 * of the key is stored, and the key is shown once when HR generates it. A
 * wrong or missing key is a 401 and nothing is read. Punches are stored as
 * received, are never stored twice, and one whose code belongs to nobody yet
 * is kept for when it does. Anything that fails is a non-2xx, so the relay
 * keeps the punches and tries again.
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const [settings] = await db.select({ hash: payrollSettings.attendanceKeyHash }).from(payrollSettings).where(eq(payrollSettings.id, 1));

  const expected = settings?.hash ?? "";
  const given = createHash("sha256").update(presented).digest("hex");
  const ok = expected.length === 64 && presented.length > 0 && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body was not valid JSON" }, { status: 400 });
  }
  const list = (body as { punches?: unknown })?.punches;
  if (!Array.isArray(list)) return NextResponse.json({ error: "Expected { punches: [...] }" }, { status: 400 });
  if (list.length > MAX_PUNCHES_PER_REQUEST) return NextResponse.json({ error: "Too many punches in one request" }, { status: 413 });

  const punches: Punch[] = [];
  let skipped = 0;
  for (const p of list as Array<{ code?: unknown; time?: unknown }>) {
    const at = typeof p?.time === "string" ? parsePunchTime(p.time) : null;
    const code = typeof p?.code === "string" || typeof p?.code === "number" ? String(p.code).trim() : "";
    if (!code || !at) {
      skipped += 1;
      continue;
    }
    punches.push({ code, at });
  }

  try {
    const result = await ingestPunches(db, punches, { source: "relay" });
    return NextResponse.json({ ok: true, ...result, skipped });
  } catch {
    return NextResponse.json({ error: "Could not store the punches" }, { status: 500 });
  }
}
