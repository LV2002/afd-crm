import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { biometricDevices } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** The device asks whether the server has any command for it. There is never one. */
export async function GET(request: Request) {
  const serial = new URL(request.url).searchParams.get("SN");
  if (!serial) return new Response("Unknown device", { status: 403 });
  const [d] = await db.select({ id: biometricDevices.id }).from(biometricDevices).where(eq(biometricDevices.serial, serial));
  if (!d) return new Response("Unknown device", { status: 403 });
  await db.update(biometricDevices).set({ lastSeenAt: new Date() }).where(eq(biometricDevices.id, d.id));
  return new Response("OK", { headers: { "content-type": "text/plain" } });
}
