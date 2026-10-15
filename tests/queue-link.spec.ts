import { describe, expect, it } from "vitest";

import { parseQueueKey, queueHref, temperatureHref } from "@/lib/my-day/queue-link";

describe("queueHref", () => {
  it("opens the leads list on the bucket the card counted", () => {
    expect(queueHref("due_today")).toBe("/leads?queue=due_today");
    expect(queueHref("overdue")).toBe("/leads?queue=overdue");
    expect(queueHref("new")).toBe("/leads?queue=new");
    expect(queueHref("at_risk")).toBe("/leads?queue=at_risk");
  });

  it("carries whose day it is when a manager opens a counsellor's", () => {
    expect(queueHref("new", "abc-123")).toBe("/leads?queue=new&for=abc-123");
  });
});

describe("parseQueueKey", () => {
  it("accepts only the four buckets", () => {
    expect(parseQueueKey("due_today")).toBe("due_today");
    expect(parseQueueKey("everything")).toBeNull();
    expect(parseQueueKey("")).toBeNull();
    expect(parseQueueKey(undefined)).toBeNull();
  });
});

describe("temperatureHref", () => {
  it("filters the list to one temperature", () => {
    expect(temperatureHref("not_contacted")).toBe("/leads?f_temperature=not_contacted");
  });

  it("adds the counsellor, so a manager sees THEIR leads and not the whole centre's", () => {
    expect(temperatureHref("cold", "u-1")).toBe("/leads?f_temperature=cold&f_assigned_to=u-1");
  });

  it("escapes a value that is not URL-safe", () => {
    expect(temperatureHref("a b&c")).toBe("/leads?f_temperature=a+b%26c");
  });
});
