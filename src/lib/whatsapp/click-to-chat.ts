/** A wa.me link that opens a chat with the institute's number, optionally with a message already typed. */
export function clickToChatLink(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, "");
  const text = message?.trim();
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Plain-English meaning of Meta's messaging-limit tier. */
export function describeTier(tier: string | null): string {
  switch (tier) {
    case "TIER_50": return "50 new people a day";
    case "TIER_250": return "250 new people a day";
    case "TIER_1K": return "1,000 new people a day";
    case "TIER_10K": return "10,000 new people a day";
    case "TIER_100K": return "100,000 new people a day";
    case "TIER_UNLIMITED": return "no daily limit";
    default: return "not reported";
  }
}

export function describeQuality(rating: string | null): { label: string; tone: "good" | "warn" | "bad" | "unknown" } {
  switch (rating) {
    case "GREEN": return { label: "Good — people are happy with your messages", tone: "good" };
    case "YELLOW": return { label: "Medium — slow down on broadcasts", tone: "warn" };
    case "RED": return { label: "Low — pause broadcasts and fix the cause", tone: "bad" };
    default: return { label: "Not reported yet", tone: "unknown" };
  }
}
