import { timingSafeEqual } from "node:crypto";

/**
 * The static key some senders use instead of signing a request.
 *
 * HMAC signing is stronger and remains what this CRM asks for first. But
 * a lot of the places AFD actually gets leads from — course platforms,
 * form builders, no-code automation steps — cannot compute a signature.
 * Their integration screens offer a URL, a sample payload and one box
 * labelled something like "API key" or "Authorization header". Before
 * this, the only way to accept those was `require_signature` off, which
 * made the URL the entire credential. A fixed key is weaker than a
 * signature and far stronger than that.
 *
 * ## Two header spellings, on purpose
 *
 * `Authorization: Bearer <key>` is the convention. `X-AFD-Key: <key>` is
 * here because a surprising number of senders let you set any header
 * except that one — it is reserved by their own outbound client, or their
 * UI strips it. Accepting both costs three lines and removes the most
 * likely reason an otherwise-correct setup fails.
 *
 * A bare `Authorization: <key>` with no scheme is accepted too, for the
 * platforms whose "header value" box is taken literally.
 */
export function presentedAuthKey(headers: Headers): string | null {
  const direct = headers.get("x-afd-key");
  if (direct) return direct.trim();

  const authorization = headers.get("authorization");
  if (!authorization) return null;

  const trimmed = authorization.trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(trimmed);
  return bearer ? bearer[1].trim() : trimmed;
}

/**
 * Constant-time, for the same reason `requireCronSecret()` is: this
 * codebase already compares every other credential that way, and the one
 * check that does not is the one that gets copied into the next feature.
 *
 * `expected` null means the endpoint wants no key, which is not the same
 * as "any key will do" — it is the caller's job to skip this entirely in
 * that case, and passing null here still refuses.
 */
export function authKeyMatches(expected: string | null, presented: string | null): boolean {
  if (!expected || !presented) return false;

  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(presented, "utf8");
  // timingSafeEqual throws on a length mismatch, which would leak the
  // length through an exception rather than a return value.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
