import type { MessageTemplate } from "@/lib/integrations/whatsapp/templates";

/** A template as the inbox picker needs it: what it says and what it asks for. */
export interface SendableTemplate {
  name: string;
  language: string;
  category: string;
  header: string | null;
  headerKind: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | null;
  body: string;
  footer: string | null;
  /** How many {{n}} values the body takes. */
  variableCount: number;
  buttons: string[];
}

export function variableCountOf(text: string): number {
  const found = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return found.length === 0 ? 0 : Math.max(...found);
}

/** Approved templates only: the rest cannot be sent, so they are not offered. */
export function sendableTemplates(all: readonly MessageTemplate[]): SendableTemplate[] {
  return all
    .filter((t) => t.status === "APPROVED")
    .map((t) => {
      const body = t.components.find((c) => c.type === "BODY")?.text ?? "";
      const header = t.components.find((c) => c.type === "HEADER");
      return {
        name: t.name,
        language: t.language,
        category: t.category,
        header: header?.format === "TEXT" ? (header.text ?? null) : null,
        headerKind: header?.format ?? null,
        body,
        footer: t.components.find((c) => c.type === "FOOTER")?.text ?? null,
        variableCount: variableCountOf(body),
        buttons: (t.components.find((c) => c.type === "BUTTONS")?.buttons ?? []).map((b) => b.text),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The body with the values typed so far filled in; an empty one stays as {{n}} so it is obvious what is missing. */
export function renderTemplateBody(body: string, values: readonly string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, n: string) => {
    const v = values[Number(n) - 1]?.trim();
    return v ? v : whole;
  });
}

/** Saved replies matching what is typed after a slash: "/fe" finds /fees and "Fee structure". */
export function matchSavedReplies<T extends { title: string; shortcut: string | null }>(replies: readonly T[], typed: string): T[] {
  const q = typed.replace(/^\//, "").trim().toLowerCase();
  if (!q) return [...replies];
  return replies.filter((r) => (r.shortcut ?? "").toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
}
