/**
 * What a WhatsApp delivery failure means, in words somebody can act on.
 *
 * Meta accepts a send (HTTP 200 and a message id) before it has tried to
 * deliver it, so "sent" only means "queued". The real outcome arrives later
 * as a status update, and when it is `failed` it carries one of these codes.
 */
const KNOWN: Record<number, string> = {
  131042: "Meta could not charge for this message: add or fix the payment method on the WhatsApp Business Account (WhatsApp Manager → Payment methods) and make sure it is not over its limit.",
  131053: "Meta could not download the attached file. The link must be public, https, and return the PDF itself (not a sign-in or Google Drive 'virus scan' page). Host the PDF somewhere that serves the file directly.",
  131030: "This number is not on the allowed list. While the app is in development mode, WhatsApp only sends to numbers added as test recipients (Meta app → WhatsApp → API Setup).",
  131026: "The message could not be delivered: the number is not on WhatsApp, has not accepted WhatsApp's terms, or is using an old version of the app.",
  131047: "More than 24 hours since they last wrote, so only an approved template may be sent.",
  131048: "Meta limited this number for sending too many messages that people reported or ignored.",
  131049: "Meta chose not to deliver this marketing message to this person to keep their experience healthy. Retrying will not help.",
  131056: "Too many messages to this same person from this number in a short time. Wait and retry.",
  131031: "The WhatsApp Business Account is locked or restricted. Check WhatsApp Manager for a notice.",
  131021: "The recipient is the same number the message is sent from.",
  130429: "Sending too fast for this number's current limit. It will recover on its own.",
  132000: "The number of values sent does not match the template. Check the template's {{1}}, {{2}} fields in the automation step.",
  132001: "No approved template with that name and language exists. Check the name and that Meta has approved it.",
  132005: "The text filled into the template is too long once translated.",
  132007: "Meta's content policy blocked this template text.",
  132012: "A value does not fit the template's expected format (for example a document link where text was expected).",
  132015: "The template is paused because of poor quality feedback. Check it in WhatsApp Manager.",
  132016: "The template has been disabled. Create a new one in WhatsApp Manager.",
  133010: "The sending phone number is not registered with the WhatsApp Cloud API.",
  133016: "Too many registration attempts on this number. Wait and retry.",
};

export function describeDeliveryError(code: number | null | undefined, title?: string | null): string {
  const known = code != null ? KNOWN[code] : undefined;
  const label = code != null ? `Error ${code}${title ? ` (${title})` : ""}` : title ?? "Failed";
  return known ? `${label}: ${known}` : label;
}
