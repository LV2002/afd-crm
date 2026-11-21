import type { GeminiContent } from "@/lib/ai/gemini";

/**
 * Drafting a reply with Gemini — pure helpers, no I/O.
 *
 * The draft goes into the message box for a person to read, change and
 * send. Nothing is ever sent by the model, and it is told to promise
 * nothing the school has not written down: fees, dates and availability
 * are for a counsellor to confirm.
 */

export interface ChatLine {
  direction: "inbound" | "outbound";
  text: string;
}

const MAX_LINES = 12;
const MAX_LINE_CHARS = 500;

export function buildSystemInstruction(input: { orgName: string; courses: string[]; savedReplies: Array<{ title: string; body: string }> }): string {
  const courses = input.courses.length ? input.courses.join(", ") : "not listed";
  const replies = input.savedReplies
    .slice(0, 15)
    .map((r) => `- ${r.title}: ${r.body.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");
  return [
    `You draft WhatsApp replies for a counsellor at ${input.orgName}, a design and architecture entrance-exam coaching institute.`,
    "Write one short, warm, plain reply (under 60 words) to the student's last message, in the language they wrote in.",
    "Use only the facts below. Never state fees, dates, batch availability or results unless they appear below; instead say a counsellor will confirm.",
    "Do not use markdown, headings or quotation marks. Do not sign off with a name.",
    `Courses offered: ${courses}.`,
    replies ? `Approved wording the team already uses:\n${replies}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The conversation as Gemini turns: the student is the user, our side is the model. */
export function buildContents(lines: ChatLine[], firstName: string): GeminiContent[] {
  const recent = lines.filter((l) => l.text.trim()).slice(-MAX_LINES);
  const contents: GeminiContent[] = recent.map((l) => ({
    role: l.direction === "inbound" ? "user" : "model",
    parts: [{ text: l.text.trim().slice(0, MAX_LINE_CHARS) }],
  }));
  // Gemini wants the last turn to be the user's; ours is a draft request.
  contents.push({ role: "user", parts: [{ text: `Write the counsellor's next reply to ${firstName || "the student"}.` }] });
  return contents;
}

/** Strips quotes and markdown the model sometimes adds, and caps the length. */
export function cleanSuggestion(text: string): string {
  return text
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1000);
}
