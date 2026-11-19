import { err, ok, type Result } from '@mb/platform';
import { isAllowed, looksLikeChallenge } from '../domain/politeness.ts';

export interface FetchedPage {
  readonly url: string;
  readonly status: number;
  readonly html: string;
}

// Port: how pages and plain text files are really fetched.
export interface PageSource {
  getPage(url: string): Promise<Result<FetchedPage, string>>;
  getText(url: string): Promise<Result<{ status: number; text: string }, string>>;
}

export type ReadError =
  | { readonly kind: 'blocked'; readonly url: string; readonly status: number }
  | { readonly kind: 'stopped' } // an earlier request was blocked, so nothing more is sent
  | { readonly kind: 'robots'; readonly url: string }
  | { readonly kind: 'failed'; readonly url: string; readonly message: string };

export interface GentleOptions {
  readonly origin: string;
  readonly agentName: string; // e.g. AFDIndiaEngine
  readonly delayMs: number;
  readonly sleep: (ms: number) => Promise<void>;
}

// Honest and gentle: obeys robots.txt, waits between pages, and stops for good at the first 403, 429 or challenge page.
// It never retries around a block (CLAUDE.md product rule).
export class GentleReader {
  private readonly source: PageSource;
  private readonly options: GentleOptions;
  private robots: string | undefined;
  private stoppedBy: ReadError | undefined;
  private requests = 0;

  constructor(source: PageSource, options: GentleOptions) {
    this.source = source;
    this.options = options;
  }

  get stopped(): ReadError | undefined {
    return this.stoppedBy;
  }

  async read(url: string): Promise<Result<FetchedPage, ReadError>> {
    if (this.stoppedBy !== undefined) return err({ kind: 'stopped' });
    const robots = await this.loadRobots();
    if (robots !== undefined) return err(robots);
    if (!isAllowed(this.robots ?? '', this.options.agentName, new URL(url).pathname)) return err({ kind: 'robots', url });
    await this.pause();
    const got = await this.source.getPage(url);
    if (!got.ok) return err({ kind: 'failed', url, message: got.error });
    if (looksLikeChallenge(got.value.status, got.value.html)) return this.stop({ kind: 'blocked', url, status: got.value.status });
    return ok(got.value);
  }

  // A plain text file (the sitemap), fetched with the same manners as a page.
  async readText(url: string): Promise<Result<string, ReadError>> {
    if (this.stoppedBy !== undefined) return err({ kind: 'stopped' });
    const robots = await this.loadRobots();
    if (robots !== undefined) return err(robots);
    await this.pause();
    const got = await this.source.getText(url);
    if (!got.ok) return err({ kind: 'failed', url, message: got.error });
    if (got.value.status === 403 || got.value.status === 429) return this.stop({ kind: 'blocked', url, status: got.value.status });
    return got.value.status === 200 ? ok(got.value.text) : err({ kind: 'failed', url, message: `status ${String(got.value.status)}` });
  }

  private async loadRobots(): Promise<ReadError | undefined> {
    if (this.robots !== undefined) return undefined;
    await this.pause();
    const url = `${this.options.origin}/robots.txt`;
    const got = await this.source.getText(url);
    if (!got.ok) { this.robots = ''; return undefined; } // unreachable robots.txt means no rules, as the standard says
    if (got.value.status === 403 || got.value.status === 429) { this.stop({ kind: 'blocked', url, status: got.value.status }); return this.stoppedBy; }
    this.robots = got.value.status === 200 ? got.value.text : '';
    return undefined;
  }

  private async pause(): Promise<void> {
    if (this.requests > 0) await this.options.sleep(this.options.delayMs);
    this.requests++;
  }

  private stop(why: ReadError): Result<never, ReadError> {
    this.stoppedBy = why;
    return err(why);
  }
}
