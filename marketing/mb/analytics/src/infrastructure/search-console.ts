import { err, ok, type GoogleAuth, type Result } from '@mb/platform';
import type { SearchDemandPort } from '../application/ports.ts';
import { pathOf } from '../domain/dates.ts';
import type { GscPageDay, GscPageQuery, GscQueryDay } from '../domain/types.ts';

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface SearchConsoleOptions {
  readonly auth: GoogleAuth;
  readonly fetch: Fetch;
  readonly site: string; // for example sc-domain:afdindia.com
}

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const PAGE_SIZE = 25_000;

interface ApiRow { keys: string[]; clicks: number; impressions: number; position: number }

// Reads Search Console with the shared service account (read-only scope).
export class GoogleSearchConsole implements SearchDemandPort {
  private readonly o: SearchConsoleOptions;

  constructor(options: SearchConsoleOptions) {
    this.o = options;
  }

  private async rows(from: string, to: string, dimensions: string[]): Promise<Result<ApiRow[], string>> {
    const token = await this.o.auth.token(SCOPE);
    if (!token.ok) return err(token.error);
    const out: ApiRow[] = [];
    for (let startRow = 0; ; startRow += PAGE_SIZE) {
      const res = await this.o.fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.o.site)}/searchAnalytics/query`, {
        method: 'POST', headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: from, endDate: to, dimensions, rowLimit: PAGE_SIZE, startRow, dataState: 'final' }),
      });
      if (res.status === 403) { const who = this.o.auth.clientEmail(); return err(`Search Console says no. Add ${who.ok ? who.value : 'the service account'} as a user on ${this.o.site} (Restricted is enough).`); }
      if (!res.ok) return err(`Search Console answered with status ${String(res.status)}.`);
      const page = ((await res.json()) as { rows?: ApiRow[] }).rows ?? [];
      out.push(...page);
      if (page.length < PAGE_SIZE) return ok(out);
    }
  }

  async pageByDay(from: string, to: string): Promise<Result<GscPageDay[], string>> {
    const r = await this.rows(from, to, ['date', 'page']);
    return r.ok ? ok(r.value.map((x) => ({ date: x.keys[0] ?? '', page: pathOf(x.keys[1] ?? ''), clicks: x.clicks, impressions: x.impressions, position: x.position }))) : r;
  }

  async queryByDay(from: string, to: string): Promise<Result<GscQueryDay[], string>> {
    const r = await this.rows(from, to, ['date', 'query']);
    return r.ok ? ok(r.value.map((x) => ({ date: x.keys[0] ?? '', query: x.keys[1] ?? '', clicks: x.clicks, impressions: x.impressions, position: x.position }))) : r;
  }

  async pageQueries(from: string, to: string): Promise<Result<GscPageQuery[], string>> {
    const r = await this.rows(from, to, ['page', 'query']);
    return r.ok ? ok(r.value.map((x) => ({ page: pathOf(x.keys[0] ?? ''), query: x.keys[1] ?? '', clicks: x.clicks, impressions: x.impressions, position: x.position }))) : r;
  }
}
