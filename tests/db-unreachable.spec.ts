/**
 * `isDatabaseUnreachable` decides whether the Insights page shows a
 * "check your DATABASE_URL" message or lets the error crash the page.
 * Getting that wrong in the permissive direction would hide real bugs
 * behind a misleading config message, so the boundary is pinned here.
 *
 * Pure logic — no database needed:  npm test -- db-unreachable
 */
import { describe, expect, it } from "vitest";

import { isDatabaseUnreachable } from "../src/lib/db/client";

function errorWithCode(code: string): Error {
  return Object.assign(new Error(`connect ${code} 10.255.255.1:5432`), { code });
}

describe("isDatabaseUnreachable", () => {
  it("matches a connection that stalled until connect_timeout", () => {
    // The case that caused the Insights page to hang: an IPv6-only Supabase
    // direct host on a network with no IPv6 route drops packets rather than
    // refusing them, so nothing errors until the timeout fires.
    expect(isDatabaseUnreachable(errorWithCode("CONNECT_TIMEOUT"))).toBe(true);
  });

  it.each(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT", "ECONNRESET"])(
    "matches %s",
    (code) => {
      expect(isDatabaseUnreachable(errorWithCode(code))).toBe(true);
    },
  );

  it("does NOT match a query-level error — those are real bugs and must still throw", () => {
    // Postgres SQLSTATEs, not socket errors: undefined column, unique
    // violation, permission denied (an RLS policy rejecting a write).
    expect(isDatabaseUnreachable(errorWithCode("42703"))).toBe(false);
    expect(isDatabaseUnreachable(errorWithCode("23505"))).toBe(false);
    expect(isDatabaseUnreachable(errorWithCode("42501"))).toBe(false);
  });

  it("does not match an error carrying no code, or a non-error value", () => {
    expect(isDatabaseUnreachable(new Error("something went wrong"))).toBe(false);
    expect(isDatabaseUnreachable("ECONNREFUSED")).toBe(false);
    expect(isDatabaseUnreachable(null)).toBe(false);
    expect(isDatabaseUnreachable(undefined)).toBe(false);
  });
});
