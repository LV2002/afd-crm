import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyMetaSignature } from "../src/lib/integrations/meta/verify-signature";

const SECRET = "app-secret-123";

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("verifyMetaSignature", () => {
  it("accepts a correctly-signed body", () => {
    const body = '{"hello":"world"}';
    expect(verifyMetaSignature(body, sign(body, SECRET), SECRET)).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    const body = '{"hello":"world"}';
    expect(verifyMetaSignature(body, sign(body, "wrong-secret"), SECRET)).toBe(false);
  });

  it("rejects a body that was tampered with after signing", () => {
    const original = '{"amount":100}';
    const tampered = '{"amount":999}';
    expect(verifyMetaSignature(tampered, sign(original, SECRET), SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyMetaSignature("{}", null, SECRET)).toBe(false);
  });

  it("rejects a header using the wrong algorithm prefix", () => {
    const body = "{}";
    const wrongAlgo = `sha1=${createHmac("sha1", SECRET).update(body).digest("hex")}`;
    expect(verifyMetaSignature(body, wrongAlgo, SECRET)).toBe(false);
  });

  it("rejects a malformed header with no '=' separator", () => {
    expect(verifyMetaSignature("{}", "not-a-valid-header", SECRET)).toBe(false);
  });

  it("returns false rather than throwing when the app secret is empty", () => {
    const body = "{}";
    expect(verifyMetaSignature(body, sign(body, SECRET), "")).toBe(false);
  });

  it("rejects a hex digest of the wrong length without throwing", () => {
    expect(verifyMetaSignature("{}", "sha256=abcd", SECRET)).toBe(false);
  });
});
