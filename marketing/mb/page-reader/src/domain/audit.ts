import type { PageFacts } from './page-facts.ts';

export type Group = 'index' | 'markup' | 'media' | 'conversion' | 'geo';

export interface AuditFinding {
  readonly id: string;
  readonly group: Group;
  readonly status: 'ok' | 'warn' | 'fail';
  readonly detail: string;
  readonly fix: string;
}

export interface AuditContext {
  // The exam cycle being written about (2027 for admissions that start in 2027).
  readonly cycleYear: number;
  // Ten-digit numbers that belong to AFD (from config); anything else on a page is flagged.
  readonly knownPhones: readonly string[];
  // Images that appear on most pages (logos, icons): not the page's own, so never counted as missing alt text.
  readonly templateImages: ReadonlySet<string>;
  // Domains of official sources (exam bodies); a guide post should cite at least one.
  readonly officialDomains: readonly string[];
}

export type Check = (page: PageFacts, ctx: AuditContext) => AuditFinding | undefined;

export const ok = (id: string, group: Group, detail: string): AuditFinding => ({ id, group, status: 'ok', detail, fix: '' });
export const warn = (id: string, group: Group, detail: string, fix: string): AuditFinding => ({ id, group, status: 'warn', detail, fix });
export const fail = (id: string, group: Group, detail: string, fix: string): AuditFinding => ({ id, group, status: 'fail', detail, fix });
