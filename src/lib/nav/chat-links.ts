/**
 * The chat sources nested under "Chats" in the main navigation, like the
 * counsellors nested under Dashboard. Pure helpers, shared by the server
 * (which decides who is listed) and the sidebar (which decides which is
 * highlighted).
 */

export interface ChatLink {
  key: string;
  label: string;
  href: string;
  kind: "api" | "own";
  /** Conversations on this source waiting for a reply. Zero shows no badge. */
  waiting: number;
}

/** Anything under /whatsapp that is neither the overview nor a counsellor's own inbox: the API inbox and its tools. */
export function isApiSection(pathname: string): boolean {
  return pathname.startsWith("/whatsapp/") && !pathname.startsWith("/whatsapp/personal");
}

/** Which nested link is "here". A counsellor's number is picked out by the `number` in the address. */
export function chatLinkActive(link: ChatLink, pathname: string, search: string): boolean {
  if (link.kind === "api") return isApiSection(pathname);
  if (!pathname.startsWith("/whatsapp/personal")) return false;
  const wanted = new URL(link.href, "http://x").searchParams.get("number");
  return new URLSearchParams(search).get("number") === wanted;
}
