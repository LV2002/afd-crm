import { describe, expect, it } from "vitest";

const { contactPhoneOf } = await import("../src/lib/whatsapp/get-threads");
const { readableMessage } = await import("../src/lib/whatsapp/placeholders");

describe("which number a conversation belongs to", () => {
  it("is the other person's number whichever way the message went", () => {
    expect(contactPhoneOf({ direction: "inbound", from_phone: "+919847000001", to_phone: "+914840000000" })).toBe("+919847000001");
    // A reply we sent: from_phone is OUR number, so the conversation must key on to_phone.
    expect(contactPhoneOf({ direction: "outbound", from_phone: "1909032705887977", to_phone: "+919847000001" })).toBe("+919847000001");
    expect(contactPhoneOf({ direction: "outbound", from_phone: "+914840000000", to_phone: null })).toBe("+914840000000");
  });
});

describe("old placeholder messages", () => {
  it("are read as system notices and plain sentences instead of '[system message]'", () => {
    expect(readableMessage({ messageType: "text", body: "[system message]" })).toMatchObject({ messageType: "system", body: "WhatsApp system notice" });
    expect(readableMessage({ messageType: "text", body: "[order message]" }).body).toMatch(/This kind of message \(order\)/);
    expect(readableMessage({ messageType: "text", body: "Hi" })).toEqual({ messageType: "text", body: "Hi" });
  });
});
