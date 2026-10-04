/**
 * Instagram messaging webhook payloads, turned into something worth
 * storing. Pure, so the shape of Meta's JSON can be tested against real
 * examples rather than discovered in production.
 *
 * Meta sends every event for the `instagram` object to one callback, and
 * most of them are not messages: delivery receipts, read receipts,
 * reactions, deletions, and echoes of messages this app itself sent. The
 * job here is to pick out the inbound human messages and say plainly how
 * many events were ignored, so a delivery that carried nothing we store
 * can be recorded as *that* rather than as a failure.
 */

export interface InstagramWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: Array<{
      sender?: { id?: string; username?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        is_echo?: boolean;
        is_deleted?: boolean;
        is_unsupported?: boolean;
        attachments?: Array<{ type?: string; payload?: { url?: string } }>;
        reply_to?: { story?: { id?: string; url?: string }; mid?: string };
      };
      /** Read receipts and reactions arrive on the same array and are not messages. */
      read?: unknown;
      reaction?: unknown;
      delivery?: unknown;
    }>;
  }>;
}

export interface InboundInstagramMessage {
  /** The Instagram-scoped id of the person who wrote it — the only thing a reply can be addressed to. */
  igUserId: string;
  /** Our own Instagram account's id, as the payload names it. Used to tell our own echoes apart. */
  recipientId: string | null;
  igMessageId: string;
  body: string | null;
  attachmentType: string | null;
  attachmentUrl: string | null;
  replyToStory: string | null;
  sentAt: Date;
}

export interface MappedInstagramDelivery {
  messages: InboundInstagramMessage[];
  /**
   * Events seen and deliberately not stored, by kind — so the delivery
   * row can say "a read receipt, nothing to store" instead of looking
   * like a dropped message.
   */
  ignored: string[];
}

function attachmentOf(
  message: NonNullable<NonNullable<InstagramWebhookPayload["entry"]>[number]["messaging"]>[number]["message"],
): { type: string | null; url: string | null } {
  const first = message?.attachments?.[0];
  if (!first) return { type: null, url: null };
  return { type: first.type ?? "unknown", url: first.payload?.url ?? null };
}

export function mapInstagramWebhook(payload: InstagramWebhookPayload): MappedInstagramDelivery {
  const messages: InboundInstagramMessage[] = [];
  const ignored: string[] = [];

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (event.read) {
        ignored.push("read receipt");
        continue;
      }
      if (event.reaction) {
        ignored.push("reaction");
        continue;
      }
      if (event.delivery) {
        ignored.push("delivery receipt");
        continue;
      }

      const message = event.message;
      if (!message) {
        ignored.push("event with no message");
        continue;
      }

      /*
        An echo is Meta telling us about a message we sent ourselves —
        including ones sent from the Instagram app on somebody's phone.
        Skipped because the CRM already records what it sends, and
        storing an echo as inbound would put our own words in the lead's
        mouth. A message sent from the phone is therefore not in the CRM;
        that is a known gap, not a bug, and the honest alternative
        (storing echoes as outbound with no sender) is worse to read.
      */
      if (message.is_echo) {
        ignored.push("echo of a message we sent");
        continue;
      }
      if (message.is_deleted) {
        ignored.push("message deleted by the sender");
        continue;
      }

      const igUserId = event.sender?.id;
      const igMessageId = message.mid;
      if (!igUserId || !igMessageId) {
        // Without an id there is nobody to reply to, and without a mid
        // there is no way to be idempotent about it.
        ignored.push("message with no sender or no id");
        continue;
      }

      const attachment = attachmentOf(message);
      const unsupported = message.is_unsupported === true;

      messages.push({
        igUserId,
        recipientId: event.recipient?.id ?? null,
        igMessageId,
        // An unsupported message type (a voice note on some clients, a
        // shared post) arrives with no text. Recorded as a placeholder
        // rather than an empty row, so the thread shows that something
        // was said and the counsellor knows to look at Instagram.
        body: message.text?.trim() || (unsupported ? "[unsupported message type — open Instagram to see it]" : null),
        attachmentType: attachment.type,
        attachmentUrl: attachment.url,
        replyToStory: message.reply_to?.story?.id ?? null,
        sentAt: event.timestamp ? new Date(event.timestamp) : new Date(),
      });
    }
  }

  return { messages, ignored };
}

/** One line for the delivery row when a signed callback carried nothing to store. */
export function describeIgnoredEvents(ignored: string[]): string {
  const counts = new Map<string, number>();
  for (const kind of ignored) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  const parts = [...counts.entries()].map(([kind, n]) => (n > 1 ? `${kind} ×${n}` : kind));
  return `Signed callback carrying no new message — ${parts.join(", ")}. Delivery works; there was nothing to store.`;
}
