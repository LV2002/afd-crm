import { err, ok, type GoogleAuth, type Result } from '@mb/platform';
import type { WebTrafficPort } from '../application/ports.ts';
import { fromCompact } from '../domain/dates.ts';
import type { Ga4LeadDay, Ga4PageDay, Ga4SourceDay } from '../domain/types.ts';

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface Analytics4Options {
  readonly auth: GoogleAuth;
  readonly fetch: Fetch;
  readonly propertyId: string; // for example 405959903
}

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const LIMIT = 100_000;

interface ApiRow { dimensionValues: { value: string }[]; metricValues: { value: string }[] }

// Reads Google Analytics 4 with the shared service account (read-only scope).
export class GoogleAnalytics4 implements WebTrafficPort {
  private readonly o: Analytics4Options;

  constructor(options: Analytics4Options) {
    this.o = options;
  }

  private async report(from: string, to: string, dimensions: string[], metrics: string[], filter?: unknown): Promise<Result<ApiRow[], string>> {
    const token = await this.o.auth.token(SCOPE);
    if (!token.ok) return err(token.error);
    const out: ApiRow[] = [];
    for (let offset = 0; ; offset += LIMIT) {
      const res = await this.o.fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${this.o.propertyId}:runReport`, {
        method: 'POST', headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRanges: [{ startDate: from, endDate: to }], dimensions: dimensions.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })), limit: LIMIT, offset, ...(filter === undefined ? {} : { dimensionFilter: filter }) }),
      });
      if (res.status === 403) { const who = this.o.auth.clientEmail(); return err(`Analytics says no. Add ${who.ok ? who.value : 'the service account'} as a Viewer on property ${this.o.propertyId}.`); }
      if (!res.ok) return err(`Analytics answered with status ${String(res.status)}.`);
      const page = ((await res.json()) as { rows?: ApiRow[] }).rows ?? [];
      out.push(...page);
      if (page.length < LIMIT) return ok(out);
    }
  }

  async pageByDay(from: string, to: string): Promise<Result<Ga4PageDay[], string>> {
    const r = await this.report(from, to, ['date', 'pagePath'], ['sessions', 'totalUsers', 'engagedSessions']);
    return r.ok ? ok(r.value.map((x) => ({ date: fromCompact(x.dimensionValues[0]?.value ?? ''), page: x.dimensionValues[1]?.value ?? '', sessions: Number(x.metricValues[0]?.value ?? 0), users: Number(x.metricValues[1]?.value ?? 0), engagedSessions: Number(x.metricValues[2]?.value ?? 0) }))) : r;
  }

  // Our footer script reports a "generate_lead" event for every enquiry sent from a page.
  async leadsByDay(from: string, to: string): Promise<Result<Ga4LeadDay[], string>> {
    const r = await this.report(from, to, ['date', 'pagePath'], ['eventCount'], { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'generate_lead' } } });
    return r.ok ? ok(r.value.map((x) => ({ date: fromCompact(x.dimensionValues[0]?.value ?? ''), page: x.dimensionValues[1]?.value ?? '', leads: Number(x.metricValues[0]?.value ?? 0) }))) : r;
  }

  async sourcesByDay(from: string, to: string): Promise<Result<Ga4SourceDay[], string>> {
    const r = await this.report(from, to, ['date', 'sessionSourceMedium'], ['sessions', 'totalUsers']);
    return r.ok ? ok(r.value.map((x) => ({ date: fromCompact(x.dimensionValues[0]?.value ?? ''), source: x.dimensionValues[1]?.value ?? '', sessions: Number(x.metricValues[0]?.value ?? 0), users: Number(x.metricValues[1]?.value ?? 0) }))) : r;
  }
}
