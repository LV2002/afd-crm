import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

/**
 * The bearer-token check every cron route starts with.
 *
 * Two findings from the 2026-09-15 audit, closed together because they
 * are the same six lines: the guard was copy-pasted verbatim into ten
 * route handlers (code quality), and it compared with `!==` (security
 * finding #9).
 *
 * `!==` on strings short-circuits at the first differing byte, which is a
 * timing side-channel. Over HTTPS, against a long random secret, it is
 * not a practical attack — but the Meta and Google webhook handlers in
 * this same codebase already compare their signatures in constant time,
 * and having one auth check in the app that does not is the kind of
 * inconsistency that gets copied into the next one.
 *
 * Returns a 401 response to hand straight back, or null to continue.
 */
export function requireCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return unauthorized();

  const provided = request.headers.get("authorization");
  if (!provided) return unauthorized();

  return matches(provided, `Bearer ${secret}`) ? null : unauthorized();
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * `timingSafeEqual` throws on a length mismatch, which would itself leak
 * the length — so the lengths are compared first and the result is folded
 * into a single boolean either way.
 */
function matches(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
