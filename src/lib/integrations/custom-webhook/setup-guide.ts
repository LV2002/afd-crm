import { ALIASES } from "@/lib/integrations/form-payload/map-fields";

/**
 * The two blocks a sender's setup screen asks for, and that this CRM
 * could previously only describe in prose.
 *
 * Every platform that posts leads somewhere has the same four boxes: the
 * URL, a sample payload, a key, and what a successful response looks
 * like. The first and third are credentials and live on the endpoint.
 * These are the other two — and they are *derived*, not typed out, which
 * is the whole reason this is a module rather than a paragraph in the
 * card. A sample body written by hand drifts the first time somebody adds
 * an alias, and a sample that no longer maps is worse than none: it is
 * confidently wrong, and the person pasting it has no way to tell.
 *
 * So the keys come from `ALIASES` itself. If the mapper stops
 * understanding `fullname`, this sample stops offering it.
 */

/** The first alias of each group — the spelling guaranteed to map. */
function canonical(group: keyof typeof ALIASES): string {
  return ALIASES[group][0];
}

/**
 * Why the sample carries campaign parameters twice over.
 *
 * Both work now: the generic mapper reads `utm_*`, `gclid` and `fbclid`
 * out of the page URL *and* from fields of their own, merging the two
 * with explicit fields winning key by key. It did not always — URL
 * parsing was website-only, so a custom webhook posting a perfectly
 * good `?gclid=…` had it dropped.
 *
 * The sample shows both because a sender reading it decides which they
 * can do. A platform that only forwards the page address is covered by
 * the URL; one with hidden inputs is covered by the fields; and a lead
 * from an institute running several Google Ads campaigns is attributed
 * either way.
 */
const UTM_FIELDS = { utm_source: "instagram", utm_campaign: "foundation-2027" } as const;

/**
 * A body that will produce a lead, with values shaped like AFD's own.
 *
 * Only `name` and `phone` are required; the rest are here because a
 * sample's job is to show what *can* be sent, and a sender reading it
 * decides which of their fields to map across. The phone is deliberately
 * a real Indian mobile shape — a sender testing with `1234567890` gets a
 * rejection and concludes the endpoint is broken.
 */
export function samplePayload(): string {
  const body: Record<string, unknown> = {
    [canonical("name")]: "Ananya Menon",
    [canonical("phone")]: "+91 98470 12345",
    [canonical("email")]: "ananya@example.com",
    [canonical("city")]: "Kochi",
    [canonical("examYear")]: "2027",
    [canonical("exams")]: "NID, NIFT UG",
    [canonical("formName")]: "Foundation enquiry",
    [canonical("page")]: "https://afdindia.com/foundation?utm_source=instagram",
    ...UTM_FIELDS,
  };
  return JSON.stringify(body, null, 2);
}

/**
 * What a sender gets back when the lead was recorded.
 *
 * Shown because several platforms will not save an integration until you
 * tell them what success looks like, and some retry until they see it.
 */
export const SUCCESS_RESPONSE = JSON.stringify({ ok: true }, null, 2);

/**
 * Every other reply, in the order somebody debugging meets them.
 *
 * `duplicate` and the unusable-payload case are both 200s and both say
 * so here, because that is the surprising part: a sender configured to
 * retry on anything other than 200 would otherwise hammer this endpoint
 * with a submission that can never succeed. The reasoning is in the route
 * handler; this is the same decision stated where an admin reads it.
 */
export const RESPONSE_CASES: ReadonlyArray<{ status: string; body: string; meaning: string }> = [
  { status: "200", body: '{"ok":true}', meaning: "The lead was recorded." },
  {
    status: "200",
    body: '{"ok":true,"duplicate":true}',
    meaning: "Already received — a retry of something handled earlier. Nothing was created twice.",
  },
  {
    status: "200",
    body: '{"ok":false,"error":"…"}',
    meaning:
      "Arrived and was kept, but had no usable name or phone. Sending it again gives the same answer, so do not retry — the reason names the fields that did arrive.",
  },
  { status: "400", body: '{"error":"Body must be a JSON object"}', meaning: "Not JSON, or a JSON array." },
  {
    status: "401",
    body: '{"error":"Invalid signature"}',
    meaning: "The endpoint requires a signature and the one sent did not match.",
  },
  {
    status: "401",
    body: '{"error":"Invalid authentication key"}',
    meaning: "The endpoint has an authentication key and the request did not carry it.",
  },
  {
    status: "404",
    body: '{"error":"Unknown endpoint"}',
    meaning: "Wrong URL, or the endpoint has been switched off or deleted.",
  },
  {
    status: "500",
    body: '{"error":"Could not record the enquiry"}',
    meaning: "Something broke at our end. Retrying is correct, and is what we want the sender to do.",
  },
];
