import { eq } from "drizzle-orm";

import { ingestPunches } from "@/lib/attendance/ingest";
import { parseDeviceAttLog } from "@/lib/attendance/parse";
import { db } from "@/lib/db/client";
import { biometricDevices } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * The address an eSSL / ZKTeco device with "cloud server" (ADMS) settings
 * pushes its punches to. Only devices whose serial number HR has registered
 * are answered; anything else gets a 403 and nothing is stored.
 *
 * Set on the device: server address = this site's domain, port 443 (or 80
 * where the device cannot do HTTPS), and the path is /iclock/ as the device
 * adds it itself.
 *
 * Written from the ADMS push protocol and covered by tests of its parts, but
 * not yet run against a real device: the first connection should be watched
 * on the Attendance page.
 */
async function knownDevice(serial: string | null): Promise<boolean> {
  if (!serial) return false;
  const [d] = await db.select({ id: biometricDevices.id }).from(biometricDevices).where(eq(biometricDevices.serial, serial));
  if (!d) return false;
  await db.update(biometricDevices).set({ lastSeenAt: new Date() }).where(eq(biometricDevices.id, d.id));
  return true;
}

const text = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/plain" } });

/** The handshake: tell the device what to send and how often. */
export async function GET(request: Request) {
  const serial = new URL(request.url).searchParams.get("SN");
  if (!(await knownDevice(serial))) return text("Unknown device", 403);
  return text(
    [
      `GET OPTION FROM:${serial}`,
      "ATTLOGStamp=None",
      "OPERLOGStamp=9999",
      "ErrorDelay=30",
      "Delay=10",
      "TransTimes=00:00;14:05",
      "TransInterval=1",
      "TransFlag=TransData AttLog",
      "TimeZone=330",
      "Realtime=1",
      "Encrypt=None",
      "",
    ].join("\n"),
  );
}

/** The punches themselves. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const serial = url.searchParams.get("SN");
  if (!(await knownDevice(serial))) return text("Unknown device", 403);
  const table = url.searchParams.get("table");
  if (table !== "ATTLOG") return text("OK");

  const { punches } = parseDeviceAttLog(await request.text());
  try {
    const result = await ingestPunches(db, punches, { source: "device", serial });
    return text(`OK: ${result.received}`);
  } catch {
    // Non-2xx: the device keeps its log and offers it again.
    return text("ERROR", 500);
  }
}
