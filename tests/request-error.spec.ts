/**
 * What the server records when a request fails.
 *
 * The decisions here are small and the consequences are not: getting
 * `isFrameworkControlFlow` wrong fills the health screen with every
 * mistyped URL until nobody reads it, and getting `pathWithoutQuery`
 * wrong copies counsellors' search terms — students' names — into an
 * error table.
 */
import { describe, expect, it } from "vitest";

import {
  isFrameworkControlFlow,
  pathWithoutQuery,
  requestErrorContext,
  requestErrorSource,
} from "../src/lib/errors/request-error";

describe("isFrameworkControlFlow", () => {
  it("ignores notFound() and redirect(), which work by throwing", () => {
    expect(isFrameworkControlFlow(Object.assign(new Error(), { digest: "NEXT_NOT_FOUND" }))).toBe(true);
    expect(isFrameworkControlFlow(Object.assign(new Error(), { digest: "NEXT_REDIRECT;replace;/login;307;" }))).toBe(true);
    expect(isFrameworkControlFlow(Object.assign(new Error(), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }))).toBe(true);
  });

  it("records a real fault, digest or no digest", () => {
    expect(isFrameworkControlFlow(new Error("column leads.foo does not exist"))).toBe(false);
    // A production digest is a number-as-string, never prefixed.
    expect(isFrameworkControlFlow(Object.assign(new Error("boom"), { digest: "3348501131" }))).toBe(false);
  });

  it("does not fall over on things that are not errors", () => {
    expect(isFrameworkControlFlow(null)).toBe(false);
    expect(isFrameworkControlFlow("NEXT_NOT_FOUND")).toBe(false);
    expect(isFrameworkControlFlow(undefined)).toBe(false);
  });
});

describe("pathWithoutQuery", () => {
  it("keeps the ids that make a crash reproducible", () => {
    expect(pathWithoutQuery("/leads/05353e69-abd6-48d4-9527-d0ecc7c896b2")).toBe(
      "/leads/05353e69-abd6-48d4-9527-d0ecc7c896b2",
    );
  });

  it("drops the search terms, which are students' names", () => {
    expect(pathWithoutQuery("/leads?q=Anjali+Menon&stage=demo")).toBe("/leads");
    expect(pathWithoutQuery("/leads#section")).toBe("/leads");
  });

  it("handles a missing path", () => {
    expect(pathWithoutQuery(undefined)).toBeNull();
    expect(pathWithoutQuery("")).toBeNull();
  });
});

describe("requestErrorSource", () => {
  it("separates a crashed screen from a failed save", () => {
    expect(requestErrorSource("render")).toBe("server:render");
    expect(requestErrorSource("action")).toBe("server:action");
    expect(requestErrorSource("route")).toBe("server:route");
  });

  it("refuses to let an unexpected value become part of the grouping key", () => {
    expect(requestErrorSource(undefined)).toBe("server:unknown");
    expect(requestErrorSource("render;drop table")).toBe("server:unknown");
  });
});

describe("requestErrorContext", () => {
  it("keeps the digest, which is the only thing the person on the broken screen can read out", () => {
    const context = requestErrorContext(
      Object.assign(new Error("boom"), { digest: "3348501131" }),
      { path: "/leads/abc?q=secret", method: "POST" },
      { routePath: "/leads/[id]", routeType: "render", renderSource: "react-server-components" },
    );

    expect(context.digest).toBe("3348501131");
    expect(context.path).toBe("/leads/abc");
    expect(context.routePath).toBe("/leads/[id]");
    expect(context.routeType).toBe("render");
  });

  it("is complete even when Next tells us almost nothing", () => {
    const context = requestErrorContext(new Error("boom"), undefined, undefined);
    expect(context).toEqual({
      path: null,
      method: null,
      routePath: null,
      routeType: null,
      renderSource: null,
      revalidateReason: null,
      digest: null,
    });
  });
});
