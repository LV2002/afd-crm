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
  if (!secret) {
    return unauthorized(
      "This deployment has no CRON_SECRET set, so nothing scheduled can run. Set it in the hosting environment and redeploy — environment variables only reach a new build.",
    );
  }

  const provided = request.headers.get("authorization");
  if (!provided) {
    return unauthorized(
      "No Authorization header was sent. The scheduler must send `Authorization: Bearer <CRON_SECRET>` — on cron-job.org that is the Advanced tab, under Headers.",
    );
  }

  if (!provided.startsWith("Bearer ")) {
    return unauthorized(
      'The Authorization header is not a bearer token. It must read exactly `Bearer <CRON_SECRET>` — the word Bearer, one space, then the secret.',
    );
  }

  return matches(provided, `Bearer ${secret}`)
    ? null
    : unauthorized(
        "The secret sent does not match this deployment's CRON_SECRET. Check for a stale value after a rotation, and for a trailing space or newline from pasting.",
      );
}

/**
 * Says which of the four it was.
 *
 * It used to answer a bare "Unauthorized", and that cost a debugging
 * round trip the first time a schedule was turned away: "no header at
 * all" and "header with the wrong secret" are different mistakes in
 * different places — one is the scheduler's Advanced tab, the other is a
 * value that went stale after a rotation — and from outside they look
 * identical.
 *
 * This leaks nothing. A caller already knows whether it sent a header and
 * what it put in it; the one thing never said is the expected value, and
 * the comparison above stays constant-time. The audience for these
 * sentences is an administrator reading a failed run in a scheduler's
 * history, which is exactly where the fix has to be made.
 */
function unauthorized(reason: string): NextResponse {
  return NextResponse.json({ error: "Unauthorized", reason }, { status: 401 });
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
