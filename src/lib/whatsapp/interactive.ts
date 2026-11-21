/**
 * Free-form interactive messages: tappable reply buttons and pick-from lists.
 *
 * Meta's limits are strict and an over-long title is refused outright, so
 * they are checked here, before anything is sent, with a sentence the person
 * writing the message can act on. Only usable inside the 24-hour window.
 */

export const LIMITS = {
  bodyChars: 1024,
  buttonTitleChars: 20,
  maxButtons: 3,
  listButtonChars: 20,
  maxListRows: 10,
  rowTitleChars: 24,
  rowDescriptionChars: 72,
} as const;

export interface ReplyButtons {
  body: string;
  buttons: string[];
}

export interface ListMessage {
  body: string;
  /** The label on the button that opens the list. */
  buttonText: string;
  rows: Array<{ title: string; description?: string }>;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkReplyButtons(input: ReplyButtons): Checked<ReplyButtons> {
  const body = input.body.trim();
  const buttons = input.buttons.map((b) => b.trim()).filter(Boolean);
  if (!body) return { ok: false, error: "Write the message that comes with the buttons." };
  if (body.length > LIMITS.bodyChars) return { ok: false, error: `Keep the message under ${LIMITS.bodyChars} characters.` };
  if (buttons.length === 0) return { ok: false, error: "Add at least one button." };
  if (buttons.length > LIMITS.maxButtons) return { ok: false, error: `WhatsApp allows at most ${LIMITS.maxButtons} buttons. Use a list for more.` };
  const long = buttons.find((b) => b.length > LIMITS.buttonTitleChars);
  if (long) return { ok: false, error: `"${long}" is too long for a button (${LIMITS.buttonTitleChars} characters at most).` };
  if (new Set(buttons.map((b) => b.toLowerCase())).size !== buttons.length) return { ok: false, error: "Two buttons have the same words." };
  return { ok: true, value: { body, buttons } };
}

export function checkListMessage(input: ListMessage): Checked<ListMessage> {
  const body = input.body.trim();
  const buttonText = input.buttonText.trim() || "Choose";
  const rows = input.rows.map((r) => ({ title: r.title.trim(), description: r.description?.trim() || undefined })).filter((r) => r.title);
  if (!body) return { ok: false, error: "Write the message that comes with the list." };
  if (body.length > LIMITS.bodyChars) return { ok: false, error: `Keep the message under ${LIMITS.bodyChars} characters.` };
  if (buttonText.length > LIMITS.listButtonChars) return { ok: false, error: `The button that opens the list can be ${LIMITS.listButtonChars} characters at most.` };
  if (rows.length === 0) return { ok: false, error: "Add at least one choice." };
  if (rows.length > LIMITS.maxListRows) return { ok: false, error: `A list holds at most ${LIMITS.maxListRows} choices.` };
  const long = rows.find((r) => r.title.length > LIMITS.rowTitleChars);
  if (long) return { ok: false, error: `"${long.title}" is too long for a choice (${LIMITS.rowTitleChars} characters at most).` };
  const wordy = rows.find((r) => (r.description?.length ?? 0) > LIMITS.rowDescriptionChars);
  if (wordy) return { ok: false, error: `The note under "${wordy.title}" is too long (${LIMITS.rowDescriptionChars} characters at most).` };
  if (new Set(rows.map((r) => r.title.toLowerCase())).size !== rows.length) return { ok: false, error: "Two choices have the same words." };
  return { ok: true, value: { body, buttonText, rows } };
}

/** What is stored as the message body, so the thread reads as what was sent. */
export function describeInteractive(kind: "buttons" | "list", body: string, options: string[]): string {
  return `${body}\n${kind === "buttons" ? "Buttons" : "Choices"}: ${options.join(" · ")}`;
}
