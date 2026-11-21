import { describe, expect, it } from "vitest";

import { summariseSources, type SourceDef } from "../src/lib/whatsapp/chat-sources";
import type { WhatsAppThreadSummary } from "../src/lib/whatsapp/get-threads";

function thread(over: Partial<WhatsAppThreadSummary>): WhatsAppThreadSummary {
  return {
    key: "k", leadId: "l", leadName: "A", phone: "+91", assignedTo: null, counsellorName: null, numberId: null,
    lastMessageAt: "2026-11-20T10:00:00Z", lastDirection: "inbound", lastMessagePreview: "", awaitingReply: true,
    messageCount: 1, lastInboundAt: null, resolved: false, labelIds: [], ...over,
  };
}
const api: SourceDef = { key: "api", label: "API", sublabel: "", href: "/a", numberIds: ["n-api"], includesUnnumbered: true, kind: "api" };
const athira: SourceDef = { key: "n1", label: "Athira", sublabel: "", href: "/p?number=n1", numberIds: ["n1"], includesUnnumbered: false, kind: "own", ownerId: "u-athira" };
const rahul: SourceDef = { ...athira, key: "n2", label: "Rahul", numberIds: ["n2"], ownerId: "u-rahul" };

describe("summariseSources", () => {
  it("counts per source, with unnumbered messages belonging to the API source", () => {
    const rows = summariseSources(
      [api, athira],
      [thread({ numberId: null }), thread({ numberId: "n-api", awaitingReply: false }), thread({ numberId: "n1", leadId: null }), thread({ numberId: "n1", resolved: true, awaitingReply: false })],
      { userId: "boss", isCampaigner: true },
    );
    const a = rows.find((r) => r.key === "api")!;
    const b = rows.find((r) => r.key === "n1")!;
    expect(a.open).toBe(2);
    expect(a.awaiting).toBe(1);
    expect(b.open).toBe(2 - 1);
    expect(b.unmatched).toBe(1);
  });
  it("shows a counsellor only the sources they can reach", () => {
    const rows = summariseSources([api, athira, rahul], [thread({ numberId: "n1" })], { userId: "u-athira", isCampaigner: false });
    expect(rows.map((r) => r.key)).toEqual(["n1"]);
  });
  it("shows an owner their own number even when it is empty", () => {
    const rows = summariseSources([athira], [], { userId: "u-athira", isCampaigner: false });
    expect(rows).toHaveLength(1);
  });
  it("puts sources with people waiting first", () => {
    const rows = summariseSources([api, athira], [thread({ numberId: "n1" }), thread({ numberId: "n1" })], { userId: "x", isCampaigner: true });
    expect(rows[0].key).toBe("n1");
  });
});
