/**
 * Reading a Coexistence number's webhooks.
 *
 * Three things here have consequences. Getting the **direction** wrong
 * puts the counsellor's own words in the lead's mouth, which is worse
 * than losing the message. Getting the **customer's phone** wrong
 * attaches a conversation to the wrong lead, or to none. And declaring
 * the **history backfill finished** early would have somebody conclude
 * that six months of conversations were simply not there.
 */
import { describe, expect, it } from "vitest";

import {
  describeContactSync,
  historyIsComplete,
  historyMessages,
  normaliseMessage,
} from "../src/lib/integrations/whatsapp/coexistence";

const BUSINESS = "919847000001";
const CUSTOMER = "919847012345";

describe("normaliseMessage", () => {
  it("reads a message the counsellor sent from their phone as outbound", () => {
    const result = normaliseMessage(
      { id: "wamid.1", from: BUSINESS, to: CUSTOMER, timestamp: "1791100000", type: "text" },
      BUSINESS,
    );

    expect(result).toMatchObject({
      direction: "outbound",
      customerPhone: CUSTOMER,
      businessPhone: BUSINESS,
      waMessageId: "wamid.1",
      type: "text",
    });
  });

  it("reads a message from the student as inbound", () => {
    const result = normaliseMessage(
      { id: "wamid.2", from: CUSTOMER, to: BUSINESS, timestamp: "1791100000" },
      BUSINESS,
    );

    expect(result).toMatchObject({ direction: "inbound", customerPhone: CUSTOMER });
  });

  it("compares on digits, so a + or a space does not flip the direction", () => {
    // Meta writes the display number with a + in some places and without
    // one in others. Comparing the strings would make every echo look
    // inbound.
    const result = normaliseMessage(
      { id: "wamid.3", from: "+91 98470 00001", to: CUSTOMER, timestamp: "1791100000" },
      "+919847000001",
    );

    expect(result?.direction).toBe("outbound");
  });

  it("keeps the message's own timestamp, not today", () => {
    const result = normaliseMessage(
      { id: "wamid.4", from: CUSTOMER, to: BUSINESS, timestamp: "1775000000" },
      BUSINESS,
    );

    // A history chunk from six months ago has to read in order with the
    // rest of the conversation.
    expect(result?.occurredAt.toISOString()).toBe(new Date(1775000000 * 1000).toISOString());
  });

  it("falls back to now for a timestamp it cannot read", () => {
    const before = Date.now();
    const result = normaliseMessage(
      { id: "wamid.5", from: CUSTOMER, to: BUSINESS, timestamp: "not-a-number" },
      BUSINESS,
    );

    expect(result?.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("defaults an absent type to text", () => {
    const result = normaliseMessage(
      { id: "wamid.6", from: CUSTOMER, to: BUSINESS, timestamp: "1791100000" },
      BUSINESS,
    );
    expect(result?.type).toBe("text");
  });

  describe("refuses what it cannot place", () => {
    it("a message with no id", () => {
      expect(
        normaliseMessage(
          { id: "", from: CUSTOMER, to: BUSINESS, timestamp: "1791100000" },
          BUSINESS,
        ),
      ).toBeNull();
    });

    it("a delivery that does not say which number is the business", () => {
      // Guessing the direction here would be a coin flip, and a wrong
      // guess attributes the counsellor's words to the student.
      expect(
        normaliseMessage(
          { id: "wamid.7", from: CUSTOMER, to: BUSINESS, timestamp: "1791100000" },
          null,
        ),
      ).toBeNull();
    });

    it("a message from a number to itself", () => {
      expect(
        normaliseMessage(
          { id: "wamid.8", from: BUSINESS, to: BUSINESS, timestamp: "1791100000" },
          BUSINESS,
        ),
      ).toBeNull();
    });
  });
});

describe("historyMessages", () => {
  it("flattens every message out of every thread", () => {
    const messages = historyMessages([
      {
        metadata: { phase: 0, chunk_order: 1, progress: 50 },
        threads: [
          {
            id: "t1",
            messages: [
              { id: "a", from: CUSTOMER, to: BUSINESS, timestamp: "1" },
              { id: "b", from: BUSINESS, to: CUSTOMER, timestamp: "2" },
            ],
          },
          { id: "t2", messages: [{ id: "c", from: CUSTOMER, to: BUSINESS, timestamp: "3" }] },
        ],
      },
    ]);

    expect(messages.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("is empty rather than throwing on a delivery with no threads", () => {
    expect(historyMessages([{ metadata: { phase: 1 } }])).toEqual([]);
    expect(historyMessages(undefined)).toEqual([]);
  });
});

describe("historyIsComplete", () => {
  it("is true only when the last phase reports 100", () => {
    expect(historyIsComplete([{ metadata: { phase: 2, progress: 100 } }])).toBe(true);
  });

  it("is false while the last phase is still arriving", () => {
    expect(historyIsComplete([{ metadata: { phase: 2, progress: 60 } }])).toBe(false);
  });

  it("is false when an earlier phase finishes", () => {
    // Phase 0 at 100% is a day of history, not six months. Calling that
    // done is how somebody concludes the backfill lost their chats.
    expect(historyIsComplete([{ metadata: { phase: 0, progress: 100 } }])).toBe(false);
    expect(historyIsComplete([{ metadata: { phase: 1, progress: 100 } }])).toBe(false);
  });

  it("is false for a delivery with no metadata at all", () => {
    expect(historyIsComplete([{ threads: [] }])).toBe(false);
    expect(historyIsComplete(undefined)).toBe(false);
  });

  it("finds the final chunk among several in one delivery", () => {
    expect(
      historyIsComplete([
        { metadata: { phase: 1, progress: 100 } },
        { metadata: { phase: 2, progress: 100 } },
      ]),
    ).toBe(true);
  });
});

describe("describeContactSync", () => {
  it("counts the contacts and says they were not imported", () => {
    const note = describeContactSync({ contacts: [{}, {}, {}] });

    expect(note).toContain("3 contacts");
    expect(note).toContain("not imported as leads");
  });

  it("reads correctly for one contact", () => {
    expect(describeContactSync({ contacts: [{}] })).toContain("1 contact from");
  });

  it("handles a delivery with no contacts", () => {
    expect(describeContactSync({})).toContain("0 contacts");
  });
});
