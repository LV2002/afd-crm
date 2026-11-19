import type { Result } from '@mb/platform';
import type { Ga4LeadDay, Ga4PageDay, Ga4SourceDay, GscPageDay, GscPageQuery, GscQueryDay, Source } from '../domain/types.ts';

// Port: Search Console. Each call returns rows for the period, or a readable reason it could not.
export interface SearchDemandPort {
  pageByDay(from: string, to: string): Promise<Result<GscPageDay[], string>>;
  queryByDay(from: string, to: string): Promise<Result<GscQueryDay[], string>>;
  pageQueries(from: string, to: string): Promise<Result<GscPageQuery[], string>>;
}

// Port: Google Analytics 4.
export interface WebTrafficPort {
  pageByDay(from: string, to: string): Promise<Result<Ga4PageDay[], string>>;
  leadsByDay(from: string, to: string): Promise<Result<Ga4LeadDay[], string>>;
  sourcesByDay(from: string, to: string): Promise<Result<Ga4SourceDay[], string>>;
}

export interface SyncLogEntry {
  readonly at: Date;
  readonly source: Source;
  readonly from: string;
  readonly to: string;
  readonly rows: number;
  readonly error: string | undefined;
}

// Port: where the daily snapshots are kept. Re-reading a day replaces it (Google revises recent days).
export interface AnalyticsStore {
  upsertGscPages(rows: readonly GscPageDay[]): void;
  upsertGscQueries(rows: readonly GscQueryDay[]): void;
  replaceGscPageQueries(rows: readonly GscPageQuery[]): void;
  snapshotPageQueries(week: string, rows: readonly GscPageQuery[]): void;
  upsertGa4Pages(rows: readonly Ga4PageDay[]): void;
  upsertGa4Leads(rows: readonly Ga4LeadDay[]): void;
  upsertGa4Sources(rows: readonly Ga4SourceDay[]): void;
  newestDate(source: Source): string | undefined;
  log(entry: SyncLogEntry): void;
}
