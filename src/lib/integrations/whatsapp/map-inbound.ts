export interface WhatsAppInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  /** `voice` is true for a recorded voice note, false for an audio file somebody forwarded. */
  audio?: { id: string; mime_type: string; voice?: boolean };
  video?: { id: string; mime_type: string; caption?: string };
  sticker?: { id: string; mime_type: string };
  /** A pin dropped on a map. */
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  /** One or more contact cards. */
  contacts?: Array<{ name?: { formatted_name?: string } }>;
  /** An emoji reaction to an earlier message. An empty `emoji` is the reaction being taken back. */
  reaction?: { message_id?: string; emoji?: string };
  /**
   * A tap on a template's quick-reply button. Meta sends the button's own
   * text, which is exactly what an automation branch matches on.
   */
  button?: { text?: string; payload?: string };
  /** A tap on an interactive button or list. Same idea, different envelope. */
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  /**
   * Present on the first message of a conversation that began with a tap on a
   * Click-to-WhatsApp ad (or a post). Meta puts the ad's own id in
   * `source_id` and a click id in `ctwa_clid`.
   */
  referral?: {
    source_url?: string;
    source_id?: string;
    source_type?: string;
    headline?: string;
    ctwa_clid?: string;
  };
}

export interface AdReferral {
  /** The ad's id on Meta, when it is an ad rather than a post. */
  adId: string | null;
  headline: string | null;
  clickId: string | null;
}

/**
 * Did this message start with a tap on a Meta ad?
 *
 * Meta counts a Click-to-WhatsApp conversation as a lead in Ads Manager, but
 * the message arrives on the ordinary WhatsApp webhook, where nothing said it
 * came from an ad — so the lead was filed under "WhatsApp" and Meta's own
 * numbers and the CRM's disagreed. `referral` is how Meta says it, and a
 * message carrying an ad id or click id is an ad lead.
 */
export function adReferralOf(message: Pick<WhatsAppInboundMessage, "referral">): AdReferral | null {
  const referral = message.referral;
  if (!referral) return null;
  const isAd = referral.source_type === "ad" || Boolean(referral.ctwa_clid);
  if (!isAd) return null;
  return {
    adId: referral.source_type === "ad" ? (referral.source_id ?? null) : null,
    headline: referral.headline?.trim() || null,
    clickId: referral.ctwa_clid ?? null,
  };
}

export interface WhatsAppContact {
  profile?: { name?: string };
  wa_id: string;
}

/*
 * There is no buildResolveLeadInput() here, unlike the Meta and Google
 * lead webhooks, and that absence is the point: this number never
 * creates a lead. It sends the institute's marketing and receives the
 * replies to it — AFD's enquiries arrive on the counsellors' own
 * WhatsApp Business apps and are entered by hand — so an inbound message
 * is matched to an existing lead by findLeadByPhone() or filed with no
 * lead at all. See docs/DECISIONS.md.
 */

export interface MappedMessageContent {
  messageType: "text" | "template" | "media";
  body: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  /**
   * Set when the message is not something to show. A reaction is an emoji on
   * an earlier message, not a message to answer; a disappearing or
   * view-once message arrives as `unsupported` with nothing in it. Neither
   * is stored, so neither shows as an empty bubble, makes a conversation look
   * as though it is waiting for a reply, or counts as a message. The raw
   * delivery is still in `webhook_events`.
   */
  ignore?: boolean;
}

/**
 * What an inbound message becomes.
 *
 * Media (image, document, voice note, audio, video, sticker) is recorded by
 * its Meta media id and mime type, with the sender's caption as the body;
 * the file itself is fetched into private storage by
 * `lib/whatsapp/inbound-media.ts`.
 *
 * Everything else that carries something a person wants to read is turned
 * into a line of text: a pin becomes its name or address, a contact card
 * its name. Before this, any type the mapper did not know became a message
 * with no body, which the inbox showed as "(empty message)".
 */
export function mapMessageContent(message: WhatsAppInboundMessage): MappedMessageContent {
  if (message.type === "text") {
    return {
      messageType: "text",
      body: message.text?.body ?? null,
      mediaId: null,
      mediaMimeType: null,
    };
  }

  // A button tap. Recorded as ordinary text, on purpose: to the person who
  // pressed it, and to the counsellor reading the thread, "Yes" is what
  // they said — and an automation branch matches on exactly that text.
  // Before this these arrived with a null body, so a tap looked like an
  // empty message and nothing could act on it.
  const button = buttonText(message);
  if (button !== null) {
    return { messageType: "text", body: button, mediaId: null, mediaMimeType: null };
  }
  const media =
    message.image ?? message.document ?? message.audio ?? message.video ?? message.sticker;
  if (media) {
    const caption = (media as { caption?: string }).caption?.trim() ?? "";
    return {
      messageType: "media",
      body: caption || null,
      mediaId: media.id,
      mediaMimeType: media.mime_type,
    };
  }

  if (message.type === "reaction" || message.type === "unsupported") {
    return { messageType: "text", body: null, mediaId: null, mediaMimeType: null, ignore: true };
  }

  if (message.type === "location" && message.location) {
    const { name, address, latitude, longitude } = message.location;
    const where = [name, address].filter(Boolean).join(", ");
    const coords =
      latitude !== undefined && longitude !== undefined ? `${latitude}, ${longitude}` : "";
    return {
      messageType: "text",
      body: `📍 Location${where ? `: ${where}` : ""}${coords ? ` (${coords})` : ""}`,
      mediaId: null,
      mediaMimeType: null,
    };
  }

  if (message.type === "contacts" && message.contacts?.length) {
    const names = message.contacts.map((c) => c.name?.formatted_name).filter(Boolean);
    return {
      messageType: "text",
      body: `👤 Shared ${names.length > 1 ? "contacts" : "a contact"}${names.length ? `: ${names.join(", ")}` : ""}`,
      mediaId: null,
      mediaMimeType: null,
    };
  }

  // A type this code has never heard of. Said plainly, so it is visible and
  // somebody can tell what it was, rather than an unexplained blank.
  return {
    messageType: "text",
    body: message.type && message.type !== "text" ? `[${message.type} message]` : null,
    mediaId: null,
    mediaMimeType: null,
  };
}

/**
 * The words on the button somebody pressed, or null if they didn't press
 * one.
 *
 * Three shapes, all meaning the same thing: a template's quick reply
 * (`button.text`), an interactive button (`button_reply.title`), and a
 * list selection (`list_reply.title`). The visible label is preferred
 * over the developer-facing id or payload throughout, because the label
 * is what the person believes they said.
 */
export function buttonText(message: WhatsAppInboundMessage): string | null {
  if (message.button) {
    const text = message.button.text ?? message.button.payload ?? "";
    return text.trim() || null;
  }
  const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
  if (reply) return (reply.title ?? reply.id ?? "").trim() || null;
  return null;
}
