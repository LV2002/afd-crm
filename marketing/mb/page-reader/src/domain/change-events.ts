import type { PageFacts } from './page-facts.ts';

export type ChangedField = 'title' | 'description' | 'heading' | 'content' | 'canonical' | 'noindex';

export interface ChangeEvent {
  readonly path: string;
  readonly at: Date;
  // The first time the page was ever read; nothing changed, it appeared.
  readonly first: boolean;
  readonly fields: readonly ChangedField[];
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
const words = (s: string): Set<string> => new Set(squash(s).split(' ').filter((w) => w.length > 2));

// What changed between two readings of one page. Small wobbles in the text (a counter, a date that refreshes by itself) are not changes: the text
// counts as changed only when a real share of its words differ.
export function changedFields(a: PageFacts, b: PageFacts): ChangedField[] {
  const out: ChangedField[] = [];
  if (squash(a.title) !== squash(b.title)) out.push('title');
  if (squash(a.metaDescription) !== squash(b.metaDescription)) out.push('description');
  const h = (f: PageFacts): string => f.headings.filter((x) => x.level <= 2).map((x) => squash(x.text)).join('|');
  if (h(a) !== h(b)) out.push('heading');
  if (a.canonical !== b.canonical) out.push('canonical');
  if (/noindex/i.test(a.robotsMeta) !== /noindex/i.test(b.robotsMeta)) out.push('noindex');
  const x = words(a.bodyText);
  const y = words(b.bodyText);
  const union = new Set([...x, ...y]).size;
  const same = [...x].filter((w) => y.has(w)).length;
  if (union > 0 && same / union < 0.95) out.push('content');
  return out;
}
