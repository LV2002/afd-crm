/**
 * Pairing bank statement lines with ledger entries — the decision part, with
 * no database in it so the rules can be tested on their own.
 *
 * The rule for a pair is strict and never loosened by a human: same
 * direction, same amount to the paisa. Dates are only a guide, because the
 * bank's date and the date somebody typed an entry in are often a few days
 * apart. When there is any doubt about which entry belongs to which line the
 * planner makes no pair at all; a wrong pair is worse than an open one,
 * because an open one is visible.
 */

export interface RecLine {
  id: string;
  occurredOn: string;
  direction: "in" | "out";
  amountPaise: number;
  particulars: string;
}

export interface RecTxn {
  id: string;
  occurredOn: string;
  /** Which way it moved the bank balance. A reversal row (negative amount) is already flipped. */
  direction: "in" | "out";
  /** Always positive. */
  amountPaise: number;
  reference: string | null;
}

/** Days apart still counted as "the same event" for an automatic pair. */
export const AUTO_MATCH_DAYS = 5;
/** A reference number found in the narration is stronger evidence, so the window is wider. */
export const REFERENCE_MATCH_DAYS = 14;

const DAY_MS = 86_400_000;

export function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The direction a ledger row moved the bank, accounting for reversals. */
export function effectiveDirection(
  direction: "in" | "out" | "transfer_in" | "transfer_out",
  amountPaise: number,
): "in" | "out" {
  const base = direction === "in" || direction === "transfer_in" ? "in" : "out";
  if (amountPaise >= 0) return base;
  return base === "in" ? "out" : "in";
}

export interface PlannedPair {
  lineId: string;
  transactionId: string;
}

export function planMatches(lines: RecLine[], txns: RecTxn[]): PlannedPair[] {
  const pairs: PlannedPair[] = [];
  const usedLines = new Set<string>();
  const usedTxns = new Set<string>();
  const take = (lineId: string, transactionId: string) => {
    pairs.push({ lineId, transactionId });
    usedLines.add(lineId);
    usedTxns.add(transactionId);
  };

  // 1. A UPI / cheque / bill reference that appears in the narration. Used
  //    only when it points at exactly one line and that line at exactly one
  //    entry; two entries quoting the same reference is a conflict, not a hint.
  const byRef = new Map<string, string[]>();
  const hits = new Map<string, string[]>();
  for (const t of txns) {
    const ref = t.reference ? squash(t.reference) : "";
    if (ref.length < 6) continue;
    const candidates = lines.filter(
      (l) =>
        l.direction === t.direction &&
        l.amountPaise === t.amountPaise &&
        daysBetween(l.occurredOn, t.occurredOn) <= REFERENCE_MATCH_DAYS &&
        squash(l.particulars).includes(ref),
    );
    hits.set(t.id, candidates.map((c) => c.id));
    for (const c of candidates) byRef.set(c.id, [...(byRef.get(c.id) ?? []), t.id]);
  }
  for (const t of txns) {
    const found = hits.get(t.id) ?? [];
    if (found.length !== 1) continue;
    if ((byRef.get(found[0]) ?? []).length !== 1) continue;
    take(found[0], t.id);
  }

  // 2. Same direction and amount, close in date, and no ambiguity.
  const key = (x: { direction: string; amountPaise: number }) => `${x.direction}|${x.amountPaise}`;
  const lineGroups = new Map<string, RecLine[]>();
  const txnGroups = new Map<string, RecTxn[]>();
  for (const l of lines) if (!usedLines.has(l.id)) lineGroups.set(key(l), [...(lineGroups.get(key(l)) ?? []), l]);
  for (const t of txns) if (!usedTxns.has(t.id)) txnGroups.set(key(t), [...(txnGroups.get(key(t)) ?? []), t]);

  for (const [k, ls] of lineGroups) {
    const ts = txnGroups.get(k);
    if (!ts) continue;

    // Connected groups: entries and lines that could belong to each other,
    // directly or through a chain. Each group must balance (as many entries as
    // lines) before anything in it is paired.
    const nodes = [...ls.map((l) => ({ kind: "l" as const, id: l.id, date: l.occurredOn })), ...ts.map((t) => ({ kind: "t" as const, id: t.id, date: t.occurredOn }))];
    const parent = nodes.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].kind === nodes[j].kind) continue;
        if (daysBetween(nodes[i].date, nodes[j].date) <= AUTO_MATCH_DAYS) parent[find(i)] = find(j);
      }
    }
    const components = new Map<number, typeof nodes>();
    nodes.forEach((n, i) => components.set(find(i), [...(components.get(find(i)) ?? []), n]));

    for (const comp of components.values()) {
      const cl = comp.filter((n) => n.kind === "l").sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      const ct = comp.filter((n) => n.kind === "t").sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      if (cl.length === 0 || cl.length !== ct.length) continue;
      cl.forEach((l, i) => take(l.id, ct[i].id));
    }
  }

  return pairs;
}
