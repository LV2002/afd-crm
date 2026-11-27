/**
 * Messages stored before the mapper understood their type were saved with a
 * body like "[system message]" or "[order message]". They are not rewritten in
 * the database (a data migration cannot use the new `system` kind in the same
 * transaction that adds it); they are read here as what they were.
 */
export function readableMessage<T extends { messageType: string; body: string | null }>(message: T): T {
  const body = message.body ?? "";
  if (message.messageType === "text" && body === "[system message]") {
    return { ...message, messageType: "system", body: "WhatsApp system notice" };
  }
  const old = /^\[([a-z_]+) message\]$/.exec(body);
  if (message.messageType === "text" && old) {
    return { ...message, body: `This kind of message (${old[1]}) cannot be shown here. Open it in the WhatsApp app.` };
  }
  return message;
}
