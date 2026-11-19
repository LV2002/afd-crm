// What the dashboard reads. Defined here, in the inner layer, because the dashboard logic depends on it; the database implements it.
export interface Totals { readonly clicks: number; readonly impressions: number; readonly positionSum: number }

// Port: what the dashboard reads.
export interface AnalyticsReader {
  gscTotals(from: string, to: string): Totals;
  gscDaily(from: string, to: string): { date: string; clicks: number }[];
  gscTopPages(from: string, to: string, limit: number): { page: string; clicks: number; impressions: number; position: number }[];
  gscTopQueries(from: string, to: string, limit: number): { query: string; clicks: number; impressions: number; position: number }[];
  gscPageQueries(): { page: string; query: string; clicks: number; impressions: number; position: number }[];
  // What each page ranked for in an earlier week (weeks start on Monday, yyyy-mm-dd), and which weeks exist.
  pageQuerySnapshot(week: string): { page: string; query: string; clicks: number; impressions: number; position: number }[];
  snapshotWeeks(): string[];
  ga4Totals(from: string, to: string): { sessions: number; users: number };
  ga4PageSessions(from: string, to: string): { page: string; sessions: number }[];
  ga4LeadsByPage(from: string, to: string): { page: string; leads: number }[];
  ga4Daily(from: string, to: string): { date: string; sessions: number }[];
  ga4Leads(from: string, to: string): number;
  ga4Sources(from: string, to: string, limit: number): { source: string; sessions: number }[];
  // One page over a period: for measuring what a change did.
  gscPageWindow(page: string, from: string, to: string): { clicks: number; impressions: number; positionSum: number };
  ga4PageWindow(page: string, from: string, to: string): { sessions: number; leads: number };
  // For each page, the first day Google showed it and the first day someone clicked it.
  firstSearchDays(): Map<string, { firstImpression: string; firstClick: string | undefined }>;
  // The earliest day with any search data, or undefined when nothing has been read yet.
  firstDate(): string | undefined;
  lastSync(): { at: Date; errors: string[] } | undefined;
}
