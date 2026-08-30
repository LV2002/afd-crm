import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * CLAUDE.md non-negotiable #9: "Check the HMAC signature before parsing."
 * Meta signs the exact raw request body with the app secret and sends it
 * as `sha256=<hex>` in `X-Hub-Signature-256` — verified against the raw
 * bytes/string, never the parsed-then-re-serialised JSON, since
 * re-serialisation isn't guaranteed to byte-match the original.
 *
 * `timingSafeEqual` throws if the two buffers differ in length rather than
 * returning false, so a length mismatch (wrong secret, truncated header)
 * is caught and treated as "signature invalid" rather than a crash.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;

  const [algo, providedHex] = signatureHeader.split("=");
  if (algo !== "sha256" || !providedHex) return false;

  const expectedHex = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const provided = Buffer.from(providedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}
