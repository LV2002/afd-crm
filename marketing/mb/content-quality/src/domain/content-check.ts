import { BriefSchema, type Draft } from './brief.ts';
import { copyGuard } from './copy-guard.ts';
import { blocking, type Finding } from './finding.ts';
import { hashText } from './hash.ts';
import { geoChecks, type Sibling } from './geo-checks.ts';
import { planChecks } from './plan-checks.ts';
import { readerChecks } from './reader-checks.ts';
import type { CopyRules } from './rules.ts';
import { searchChecks } from './search-checks.ts';
import { seoChecks } from './seo-checks.ts';

export interface CheckResult {
  readonly ok: boolean; // no blocking findings
  readonly blocking: readonly Finding[];
  readonly advisory: readonly Finding[];
  // What was checked. Any later edit changes the hash and voids this result.
  readonly textHash: string;
}

export const hashDraft = (d: Draft): string => hashText(JSON.stringify([d.seoTitle, d.metaDescription, d.slug, d.body, d.brief]));

// siblings: the text of the other local pages for the same exam, so a page that only swaps a place name is caught.
export function contentCheck(d: Draft, rules: CopyRules, siblings: readonly Sibling[] = []): CheckResult {
  const brief = BriefSchema.safeParse(d.brief);
  const briefProblems: Finding[] = brief.success ? [] : brief.error.issues.map((i) => blocking('brief', `brief ${i.path.join('.')}: ${i.message}`));
  const findings = [
    ...briefProblems,
    ...copyGuard([d.seoTitle, d.metaDescription, d.body].join('\n'), rules, { allowFactTokens: true }),
    ...seoChecks(d),
    ...searchChecks(d),
    ...readerChecks(d, rules),
    ...geoChecks(d, siblings),
    ...planChecks(d, siblings),
  ];
  const stopping = findings.filter((f) => f.severity === 'blocking');
  return { ok: stopping.length === 0, blocking: stopping, advisory: findings.filter((f) => f.severity === 'advisory'), textHash: hashDraft(d) };
}

// A draft may be marked ready only if its last check passed AND nothing has changed since that check.
export const isReady = (result: CheckResult, d: Draft): boolean => result.ok && result.textHash === hashDraft(d);
