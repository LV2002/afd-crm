import type { WhatsAppThreadSummary } from "./get-threads";

export interface SourceDef {
  key: string;
  label: string;
  sublabel: string;
  href: string;
  /** Which of our numbers belong to this source. */
  numberIds: string[];
  /** True for the API source: messages that name no number are its by definition (migration 0093). */
  includesUnnumbered: boolean;
  kind: "api" | "own";
  ownerId?: string | null;
}

export interface SourceSummary extends SourceDef {
  open: number;
  awaiting: number;
  unmatched: number;
  lastMessageAt: string | null;
}

/**
 * One row per chat source, counted from the threads the caller can see.
 *
 * A source is shown when the caller can reach it: the API source to
 * whoever runs campaigns or has a conversation on it; a counsellor's
 * number to its owner, to whoever runs campaigns, or to anybody who can
 * see a thread on it. Resolved conversations are not "open".
 */
export function summariseSources(
  defs: SourceDef[],
  threads: WhatsAppThreadSummary[],
  viewer: { userId: string; isCampaigner: boolean },
): SourceSummary[] {
  const out: SourceSummary[] = [];
  for (const def of defs) {
    const ids = new Set(def.numberIds);
    const mine = threads.filter((t) =>
      t.numberId === null ? def.includesUnnumbered : ids.has(t.numberId),
    );
    const reachable =
      mine.length > 0 || viewer.isCampaigner || (def.kind === "own" && def.ownerId === viewer.userId);
    if (!reachable) continue;
    out.push({
      ...def,
      open: mine.filter((t) => !t.resolved).length,
      awaiting: mine.filter((t) => t.awaitingReply).length,
      unmatched: mine.filter((t) => t.leadId === null && !t.resolved).length,
      lastMessageAt: mine.reduce<string | null>((latest, t) => (!latest || t.lastMessageAt > latest ? t.lastMessageAt : latest), null),
    });
  }
  // Sources with people waiting first, then busiest.
  return out.sort((a, b) => b.awaiting - a.awaiting || b.open - a.open || a.label.localeCompare(b.label));
}
