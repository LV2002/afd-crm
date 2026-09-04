/**
 * Honouring "stop messaging me".
 *
 * The matching rule is the part worth pinning: a message must BE the
 * keyword, not merely contain it. Getting that wrong in the permissive
 * direction unsubscribes somebody for writing "stop by tomorrow", and
 * they will never know why the messages went quiet.
 *
 * Pure logic — no database.
 */
import { describe, expect, it } from "vitest";

import { matchesKeyword, normaliseKeywordText } from "@/lib/whatsapp/opt-out-keywords";

const KEYWORDS = ["stop", "unsubscribe", "stop promotions", "opt out"];

describe("normaliseKeywordText", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normaliseKeywordText("  STOP!! ")).toBe("stop");
    expect(normaliseKeywordText("Stop   Promotions.")).toBe("stop promotions");
  });

  it("keeps letters from other scripts", () => {
    // Malayalam is the point of this: an institute in Kerala will want to
    // add a word in it, and stripping non-ASCII would silently make that
    // keyword unmatchable.
    expect(normaliseKeywordText("നിർത്തുക")).toBe("നിർത്തുക");
  });

  it("treats an empty or missing message as empty", () => {
    expect(normaliseKeywordText(null)).toBe("");
    expect(normaliseKeywordText("   ")).toBe("");
    expect(normaliseKeywordText("...")).toBe("");
  });
});

describe("matchesKeyword", () => {
  it("matches the word however it was typed", () => {
    expect(matchesKeyword("STOP", KEYWORDS)).toBe("stop");
    expect(matchesKeyword("stop.", KEYWORDS)).toBe("stop");
    expect(matchesKeyword("  Stop  ", KEYWORDS)).toBe("stop");
    expect(matchesKeyword("Unsubscribe!", KEYWORDS)).toBe("unsubscribe");
  });

  it("matches a multi-word keyword", () => {
    expect(matchesKeyword("Stop Promotions", KEYWORDS)).toBe("stop promotions");
    expect(matchesKeyword("opt   out", KEYWORDS)).toBe("opt out");
  });

  // The failure that matters. A real opt-out gets repeated; a wrong one
  // is silent, and the person just stops hearing from their counsellor.
  it("does not match a message that merely contains the word", () => {
    expect(matchesKeyword("stop by the centre tomorrow", KEYWORDS)).toBeNull();
    expect(matchesKeyword("can you stop calling in the morning", KEYWORDS)).toBeNull();
    expect(matchesKeyword("I want to unsubscribe from the other one", KEYWORDS)).toBeNull();
  });

  it("matches nothing when there is nothing to match", () => {
    expect(matchesKeyword("", KEYWORDS)).toBeNull();
    expect(matchesKeyword(null, KEYWORDS)).toBeNull();
    expect(matchesKeyword("stop", [])).toBeNull();
  });

  it("ignores a blank keyword rather than matching every empty message", () => {
    expect(matchesKeyword("hello", ["", "   "])).toBeNull();
  });

  it("returns the keyword as configured, so it can be recorded as the reason", () => {
    expect(matchesKeyword("STOP PROMOTIONS", ["Stop Promotions"])).toBe("Stop Promotions");
  });
});
