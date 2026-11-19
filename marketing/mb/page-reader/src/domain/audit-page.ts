import type { AuditContext, AuditFinding } from './audit.ts';
import { conversionChecks } from './checks-conversion.ts';
import { geoChecks } from './checks-geo.ts';
import { markupChecks } from './checks-markup.ts';
import type { PageFacts } from './page-facts.ts';

const ALL = [...markupChecks, ...conversionChecks, ...geoChecks];

export const auditPage = (page: PageFacts, ctx: AuditContext): AuditFinding[] =>
  ALL.map((check) => check(page, ctx)).filter((f): f is AuditFinding => f !== undefined);

// Images that appear on at least this share of the pages are the site's furniture, not the page's own.
export function findTemplateImages(pages: readonly PageFacts[], share = 0.4): Set<string> {
  const counts = new Map<string, number>();
  for (const p of pages) for (const src of new Set(p.images.map((i) => i.src))) counts.set(src, (counts.get(src) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= pages.length * share).map(([src]) => src));
}
