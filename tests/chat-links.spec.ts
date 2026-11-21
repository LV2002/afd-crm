import { describe, expect, it } from "vitest";

import { chatLinkActive, isApiSection, type ChatLink } from "../src/lib/nav/chat-links";

const api: ChatLink = { key: "api", label: "WhatsApp API", href: "/whatsapp/api", kind: "api", waiting: 0 };
const athira: ChatLink = { key: "n1", label: "Athira", href: "/whatsapp/personal?number=n1", kind: "own", waiting: 0 };
const rahul: ChatLink = { key: "n2", label: "Rahul", href: "/whatsapp/personal?number=n2", kind: "own", waiting: 0 };

describe("isApiSection", () => {
  it("is the API inbox and its tools, not the overview or a counsellor inbox", () => {
    expect(isApiSection("/whatsapp/api")).toBe(true);
    expect(isApiSection("/whatsapp/templates")).toBe(true);
    expect(isApiSection("/whatsapp/flows/abc")).toBe(true);
    expect(isApiSection("/whatsapp")).toBe(false);
    expect(isApiSection("/whatsapp/personal")).toBe(false);
  });
});

describe("chatLinkActive", () => {
  it("highlights the API link anywhere in the API section", () => {
    expect(chatLinkActive(api, "/whatsapp/broadcasts", "")).toBe(true);
    expect(chatLinkActive(api, "/whatsapp/personal", "number=n1")).toBe(false);
  });
  it("highlights only the counsellor whose number is open", () => {
    expect(chatLinkActive(athira, "/whatsapp/personal", "number=n1&thread=lead%3A1")).toBe(true);
    expect(chatLinkActive(rahul, "/whatsapp/personal", "number=n1")).toBe(false);
    expect(chatLinkActive(athira, "/whatsapp/api", "")).toBe(false);
  });
  it("highlights nobody on the all-counsellors inbox", () => {
    expect(chatLinkActive(athira, "/whatsapp/personal", "")).toBe(false);
  });
});
