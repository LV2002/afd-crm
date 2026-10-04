/**
 * Meta sends every event for the `instagram` object to one callback, and
 * most of them are not messages: read receipts, reactions, deletions, and
 * echoes of messages this app itself sent. Picking the human messages out
 * of that is the whole job of the mapper, and getting the echo case wrong
 * would put our own words in the lead's mouth.
 */
import { describe, expect, it } from "vitest";

import {
  describeIgnoredEvents,
  mapInstagramWebhook,
} from "../src/lib/integrations/instagram/map-webhook";
import { isWithinInstagramReplyWindow } from "../src/lib/instagram/reply-window";

function payload(messaging: unknown[]) {
  return { object: "instagram", entry: [{ id: "ig-account-1", time: 1, messaging }] } as never;
}

describe("mapInstagramWebhook", () => {
  it("reads a plain text DM", () => {
    const { messages, ignored } = mapInstagramWebhook(
      payload([
        {
          sender: { id: "igsid-1" },
          recipient: { id: "ig-account-1" },
          timestamp: 1_791_000_000_000,
          message: { mid: "mid-1", text: "  Is the NIFT foundation batch still open?  " },
        },
      ]),
    );

    expect(ignored).toEqual([]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      igUserId: "igsid-1",
      recipientId: "ig-account-1",
      igMessageId: "mid-1",
      body: "Is the NIFT foundation batch still open?",
    });
    expect(messages[0].sentAt.toISOString()).toBe("2026-10-03T04:00:00.000Z");
  });

  it("ignores an echo of a message we sent", () => {
    // Including one sent from the Instagram app on somebody's phone. The
    // CRM records what it sends itself; storing an echo as inbound would
    // attribute our own words to the lead.
    const { messages, ignored } = mapInstagramWebhook(
      payload([
        {
          sender: { id: "ig-account-1" },
          recipient: { id: "igsid-1" },
          message: { mid: "mid-echo", text: "Yes, it starts in June", is_echo: true },
        },
      ]),
    );
    expect(messages).toEqual([]);
    expect(ignored).toEqual(["echo of a message we sent"]);
  });

  it("ignores read receipts, reactions and deletions", () => {
    const { messages, ignored } = mapInstagramWebhook(
      payload([
        { sender: { id: "igsid-1" }, read: { mid: "mid-1" } },
        { sender: { id: "igsid-1" }, reaction: { emoji: "❤️" } },
        { sender: { id: "igsid-1" }, message: { mid: "mid-2", is_deleted: true } },
      ]),
    );
    expect(messages).toEqual([]);
    expect(ignored).toEqual([
      "read receipt",
      "reaction",
      "message deleted by the sender",
    ]);
  });

  it("keeps an attachment-only message, described rather than empty", () => {
    const { messages } = mapInstagramWebhook(
      payload([
        {
          sender: { id: "igsid-2" },
          message: {
            mid: "mid-3",
            attachments: [{ type: "image", payload: { url: "https://example.com/x.jpg" } }],
          },
        },
      ]),
    );
    expect(messages[0]).toMatchObject({
      body: null,
      attachmentType: "image",
      attachmentUrl: "https://example.com/x.jpg",
    });
  });

  it("records a story reply as one", () => {
    const { messages } = mapInstagramWebhook(
      payload([
        {
          sender: { id: "igsid-3" },
          message: { mid: "mid-4", text: "how much?", reply_to: { story: { id: "story-9" } } },
        },
      ]),
    );
    expect(messages[0].replyToStory).toBe("story-9");
  });

  it("gives an unsupported message type a placeholder rather than an empty row", () => {
    const { messages } = mapInstagramWebhook(
      payload([{ sender: { id: "igsid-4" }, message: { mid: "mid-5", is_unsupported: true } }]),
    );
    expect(messages[0].body).toContain("unsupported message type");
  });

  it("drops a message with no sender or no id, because neither can be acted on", () => {
    const { messages, ignored } = mapInstagramWebhook(
      payload([
        { message: { mid: "mid-6", text: "hi" } },
        { sender: { id: "igsid-5" }, message: { text: "hi" } },
      ]),
    );
    expect(messages).toEqual([]);
    expect(ignored).toEqual([
      "message with no sender or no id",
      "message with no sender or no id",
    ]);
  });

  it("survives an empty or alien payload", () => {
    expect(mapInstagramWebhook({})).toEqual({ messages: [], ignored: [] });
    expect(mapInstagramWebhook({ entry: [{}] })).toEqual({ messages: [], ignored: [] });
  });
});

describe("describeIgnoredEvents", () => {
  it("counts repeats rather than listing them", () => {
    expect(describeIgnoredEvents(["read receipt", "read receipt", "reaction"])).toContain(
      "read receipt ×2, reaction",
    );
  });

  it("says that delivery worked, because that is the point of recording it", () => {
    expect(describeIgnoredEvents(["read receipt"])).toContain("Delivery works");
  });
});

describe("isWithinInstagramReplyWindow", () => {
  const now = new Date("2026-10-04T12:00:00Z");

  it("is open within 24 hours of their last message", () => {
    expect(isWithinInstagramReplyWindow("2026-10-04T11:00:00Z", now)).toBe(true);
    expect(isWithinInstagramReplyWindow("2026-10-03T12:30:00Z", now)).toBe(true);
  });

  it("is closed at and after 24 hours", () => {
    expect(isWithinInstagramReplyWindow("2026-10-03T12:00:00Z", now)).toBe(false);
    expect(isWithinInstagramReplyWindow("2026-10-01T12:00:00Z", now)).toBe(false);
  });

  it("is closed when they have never written — there is nothing to reply to", () => {
    expect(isWithinInstagramReplyWindow(null, now)).toBe(false);
    expect(isWithinInstagramReplyWindow("not a date", now)).toBe(false);
  });
});
