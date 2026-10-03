/**
 * Meta's own words, kept.
 *
 * The client used to report "Meta Graph API returned 400" and discard the
 * body — where Meta had written the actual cause, by name: the missing
 * permission, the object that does not exist. That is the same failure as
 * a migration step that exits 1 without saying why, and it cost the same
 * thing: an afternoon of guessing at something the platform had already
 * told us.
 */
import { describe, expect, it } from "vitest";

import { MetaGraphApiError } from "../src/lib/integrations/meta/graph-client";

const err = (body: unknown) => new MetaGraphApiError("Returned 400 subscribing the Page", 400, body);

describe("MetaGraphApiError", () => {
  it("keeps the message Meta wrote, and its code", () => {
    expect(
      err({
        error: {
          message: "(#200) Requires pages_manage_metadata permission to manage the object",
          code: 200,
        },
      }).message,
    ).toBe(
      "Returned 400 subscribing the Page — (#200) Requires pages_manage_metadata permission to manage the object (code 200)",
    );
  });

  it("prefers Meta's plain-English version when there is one, and keeps both", () => {
    const message = err({
      error: {
        message: "(#100) Invalid parameter",
        error_user_msg: "This Page cannot be subscribed.",
        code: 100,
        error_subcode: 33,
      },
    }).message;

    // The human sentence leads; the developer string still follows, because
    // it is the one that names the parameter.
    expect(message).toContain("This Page cannot be subscribed.");
    expect(message).toContain("(#100) Invalid parameter");
    expect(message).toContain("(code 100, subcode 33)");
    expect(message.indexOf("This Page cannot be subscribed.")).toBeLessThan(
      message.indexOf("(#100) Invalid parameter"),
    );
  });

  it("does not repeat itself when both fields say the same thing", () => {
    const message = err({
      error: { message: "Same text", error_user_msg: "Same text", code: 1 },
    }).message;
    expect(message).toBe("Returned 400 subscribing the Page — Same text (code 1)");
  });

  it("degrades quietly when the body is not what we expected", () => {
    const plain = "Returned 400 subscribing the Page";
    expect(err(null).message).toBe(plain);
    expect(err("gateway timeout").message).toBe(plain);
    expect(err({}).message).toBe(plain);
    expect(err({ error: {} }).message).toBe(plain);
  });

  it("still carries the status and the raw body for the error log", () => {
    const body = { error: { message: "nope", code: 10 } };
    const thrown = err(body);
    expect(thrown.status).toBe(400);
    expect(thrown.body).toBe(body);
    expect(thrown.name).toBe("MetaGraphApiError");
  });
});
