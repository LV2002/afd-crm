import type { PageFacts } from './page-facts.ts';

// After the owner pastes an offer block, what search engines read must be unchanged. Compared from two page readings.
export function seoFactsChanged(before: PageFacts, after: PageFacts): string[] {
  const types = (p: PageFacts): string => p.jsonLd.flatMap((j) => j.types).sort().join(',');
  const out: string[] = [];
  if (before.title !== after.title) out.push('the title changed');
  if (before.metaDescription !== after.metaDescription) out.push('the meta description changed');
  if (before.canonical !== after.canonical) out.push('the canonical address changed');
  if (before.headings.map((h) => `${String(h.level)}${h.text}`).join('|') !== after.headings.map((h) => `${String(h.level)}${h.text}`).join('|')) out.push('a heading changed');
  if (types(before) !== types(after)) out.push('the structured data changed');
  return out;
}
