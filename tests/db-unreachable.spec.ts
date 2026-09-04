/**
 * `isDatabaseUnreachable` decides whether the Insights page shows a
 * "check your DATABASE_URL" message or lets the error crash the page.
 * Getting that wrong in the permissive direction would hide real bugs
 * behind a misleading config message, so the boundary is pinned here.
 *
 * Pure logic — no database needed:  npm test -- db-unreachable
 *
 * Imported from `db/errors` rather than `db/client` for exactly that
 * reason: `client.ts` opens a connection pool and throws on a missing
 * DATABASE_URL the moment it is imported, which made this "pure" spec
 * fail before a single assertion ran.
 */
import { describe, expect, it } from "vitest";

import { isDatabaseUnreachable, isDeadlineExceeded, withDeadline } from "../src/lib/db/errors";

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

  it("matches through a Drizzle wrapper, which puts the driver error on .cause", () => {
    // Drizzle 0.45 throws DrizzleQueryError with the postgres.js error as
    // `cause`, so the socket code is never on the top-level error. Reading
    // only the top level made this check silently never fire.
    const wrapped = Object.assign(new Error("Failed query: select 1"), {
      cause: errorWithCode("CONNECT_TIMEOUT"),
    });
    expect(isDatabaseUnreachable(wrapped)).toBe(true);
  });

  it("matches through several layers of wrapping", () => {
    const inner = errorWithCode("ENOTFOUND");
    const mid = Object.assign(new Error("driver"), { cause: inner });
    const outer = Object.assign(new Error("Failed query"), { cause: mid });
    expect(isDatabaseUnreachable(outer)).toBe(true);
  });

  it("does not hang on a self-referential cause chain", () => {
    const loop = new Error("loops forever") as Error & { cause?: unknown };
    loop.cause = loop;
    expect(isDatabaseUnreachable(loop)).toBe(false);
  });

  it("does not match a wrapped query error", () => {
    const wrapped = Object.assign(new Error("Failed query: select bogus"), {
      cause: errorWithCode("42703"),
    });
    expect(isDatabaseUnreachable(wrapped)).toBe(false);
  });

  it("does not match an error carrying no code, or a non-error value", () => {
    expect(isDatabaseUnreachable(new Error("something went wrong"))).toBe(false);
    expect(isDatabaseUnreachable("ECONNREFUSED")).toBe(false);
    expect(isDatabaseUnreachable(null)).toBe(false);
    expect(isDatabaseUnreachable(undefined)).toBe(false);
  });
});

describe("isDeadlineExceeded", () => {
  it("is true for a withDeadline rejection, and false for a plain socket timeout", async () => {
    // A query that connected fine but answered too slowly must NOT be
    // reported as an unreachable database — that sends someone to re-check
    // a DATABASE_URL that is already correct.
    const slow = new Promise((resolve) => setTimeout(resolve, 5_000));
    await expect(withDeadline(slow, 10, "test")).rejects.toThrow(/exceeded 10ms/);

    const caught = await withDeadline(slow, 10, "test").catch((e: unknown) => e);
    expect(isDeadlineExceeded(caught)).toBe(true);
    expect(isDeadlineExceeded(errorWithCode("ETIMEDOUT"))).toBe(false);
  });

  it("resolves and clears its timer when the work finishes in time", async () => {
    await expect(withDeadline(Promise.resolve("done"), 1_000, "test")).resolves.toBe("done");
  });
});
