export interface WhatsAppInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; filename?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string };
  sticker?: { id: string; mime_type: string };
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
}

/**
 * Media (image/document/audio/video/sticker) is recorded by its Meta media
 * id and mime type only — not downloaded into Supabase Storage in this
 * pass, a deliberate, documented gap (see docs/DECISIONS.md), not a
 * dropped message: the raw webhook delivery is still in `webhook_events`.
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
    return { messageType: "media", body: null, mediaId: media.id, mediaMimeType: media.mime_type };
  }
  return { messageType: "text", body: null, mediaId: null, mediaMimeType: null };
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
