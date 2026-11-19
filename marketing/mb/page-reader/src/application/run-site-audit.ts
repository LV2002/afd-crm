import type { Clock } from '@mb/platform';
import { extractPageFacts } from '../domain/extract.ts';
import type { PageFacts } from '../domain/page-facts.ts';
import type { GentleReader, ReadError } from './gentle-reader.ts';

// Port: where page readings are kept. Every reading is kept, so a rework can be compared with before.
export interface PageStore {
  save(snapshot: { readonly path: string; readonly url: string; readonly fetchedAt: Date; readonly facts: PageFacts }): void;
}

export interface SiteAuditSummary {
  readonly read: number;
  readonly failed: readonly { readonly url: string; readonly message: string }[];
  // Set when the site refused us or robots.txt said no; the audit stops and reports it, never works round it.
  readonly stopped: ReadError | undefined;
  readonly skippedByRobots: number;
}

export async function runSiteAudit(deps: { reader: GentleReader; store: PageStore; clock: Clock; progress: (pct: number, note: string) => void }, urls: readonly string[]): Promise<SiteAuditSummary> {
  let read = 0;
  let robots = 0;
  const failed: { url: string; message: string }[] = [];
  for (const [i, url] of urls.entries()) {
    deps.progress((i / Math.max(1, urls.length)) * 100, `Reading page ${String(i + 1)} of ${String(urls.length)}`);
    const got = await deps.reader.read(url);
    if (!got.ok) {
      if (got.error.kind === 'blocked' || got.error.kind === 'stopped') return { read, failed, stopped: deps.reader.stopped, skippedByRobots: robots };
      if (got.error.kind === 'robots') robots++;
      else failed.push({ url, message: got.error.message });
      continue;
    }
    deps.store.save({ path: new URL(url).pathname.replace(/\/$/, '') || '/', url, fetchedAt: deps.clock.now(), facts: extractPageFacts(got.value.html, url, got.value.status) });
    read++;
  }
  return { read, failed, stopped: undefined, skippedByRobots: robots };
}
