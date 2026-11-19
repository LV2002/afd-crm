import { addDays, buildDashboard, type AnalyticsReader, type Dashboard } from '@mb/analytics';

export interface GoogleReport {
  readonly generated: string;
  readonly dashboard: Dashboard;
  // Searches where a page ranks 5 to 15 with real impressions: the cheapest wins (rework the page, do not write a competing one).
  readonly reworkCandidates: readonly { page: string; query: string; impressions: number; clicks: number; position: number }[];
  // Searches people see us for but never click.
  readonly seenNotClicked: readonly { query: string; impressions: number; position: number }[];
  readonly queries: readonly { query: string; impressions: number; clicks: number; position: number }[];
  readonly leadsByPage: readonly { page: string; leads: number }[];
  readonly notes: readonly string[];
}

export function buildReport(reader: AnalyticsReader, today: string): GoogleReport {
  const dashboard = buildDashboard(reader, today);
  const { from, to } = dashboard.range;
  const pq = reader.gscPageQueries();
  const queries = reader.gscTopQueries(from, to, 500);
  const notes: string[] = [];
  if (!dashboard.hasData) notes.push('No search or visit data yet. Run the Google sync first.');
  const last = reader.lastSync();
  if (last !== undefined && last.errors.length > 0) notes.push(`The last sync had errors: ${last.errors.join(' | ')}`);
  return {
    generated: today, dashboard, notes,
    reworkCandidates: pq.filter((r) => r.position >= 5 && r.position <= 15 && r.impressions >= 30).sort((a, b) => b.impressions - a.impressions).slice(0, 40),
    seenNotClicked: queries.filter((q) => q.clicks === 0 && q.impressions >= 50).sort((a, b) => b.impressions - a.impressions).slice(0, 40).map(({ query, impressions, position }) => ({ query, impressions, position })),
    queries,
    leadsByPage: reader.ga4LeadsByPage(from, to).sort((a, b) => b.leads - a.leads).slice(0, 30),
  };
}

const pct = (d: { changePct: number | undefined }): string => (d.changePct === undefined ? 'n/a' : `${d.changePct >= 0 ? '+' : ''}${d.changePct.toFixed(0)}%`);

export function reportMarkdown(r: GoogleReport): string {
  const d = r.dashboard;
  const rows = (items: readonly string[]): string => (items.length === 0 ? '(none)\n' : items.map((x) => `- ${x}`).join('\n') + '\n');
  return `# Google data report, ${r.generated}

Window: ${d.range.from} to ${d.range.to} against ${d.range.prevFrom} to ${d.range.prevTo}. The newest two days are left out because Search Console runs behind.

| Measure | Now | Before | Change |
|---|---|---|---|
| Search clicks | ${d.clicks.current} | ${d.clicks.previous} | ${pct(d.clicks)} |
| Search impressions | ${d.impressions.current} | ${d.impressions.previous} | ${pct(d.impressions)} |
| Average position (lower is better) | ${d.position.current.toFixed(1)} | ${d.position.previous.toFixed(1)} | ${pct(d.position)} |
| Site visits (sessions) | ${d.sessions.current} | ${d.sessions.previous} | ${pct(d.sessions)} |
| Enquiries (generate_lead) | ${d.leads.current} | ${d.leads.previous} | ${pct(d.leads)} |

${r.notes.length > 0 ? `Notes:\n${rows(r.notes)}\n` : ''}## Rework candidates (rank 5 to 15, 30+ impressions)
${rows(r.reworkCandidates.slice(0, 15).map((x) => `${x.query} on ${x.page}: position ${x.position.toFixed(1)}, ${x.impressions} impressions, ${x.clicks} clicks`))}
## Seen but never clicked (50+ impressions)
${rows(r.seenNotClicked.slice(0, 15).map((x) => `${x.query}: ${x.impressions} impressions, position ${x.position.toFixed(1)}`))}
## Enquiries by page
${rows(r.leadsByPage.slice(0, 15).map((x) => `${x.page}: ${x.leads}`))}
## Where visitors come from
${rows(d.sources.slice(0, 10).map((x) => `${x.source}: ${x.sessions} sessions`))}
Estimates only: a change in a number is not proof of what caused it.
`;
}

export interface PageWindowReport { readonly page: string; readonly publishedOn: string; readonly before: { clicks: number; impressions: number; sessions: number; leads: number }; readonly after: { clicks: number; impressions: number; sessions: number; leads: number }; readonly siteClicksBefore: number; readonly siteClicksAfter: number; readonly verdict: string }

// The 28 days after a page went live (starting after a 3 day lag) against the 28 days before, set against the whole site's movement over the same weeks.
export function pageWindow(reader: AnalyticsReader, page: string, publishedOn: string, today: string): PageWindowReport {
  const LAG = 3; const WIN = 28;
  const afterFrom = addDays(publishedOn, LAG); const afterTo = addDays(afterFrom, WIN - 1);
  const beforeTo = addDays(publishedOn, -1); const beforeFrom = addDays(beforeTo, -(WIN - 1));
  const side = (from: string, to: string): PageWindowReport['before'] => { const g = reader.gscPageWindow(page, from, to); const a = reader.ga4PageWindow(page, from, to); return { clicks: g.clicks, impressions: g.impressions, sessions: a.sessions, leads: a.leads }; };
  const before = side(beforeFrom, beforeTo); const after = side(afterFrom, afterTo);
  const sb = reader.gscTotals(beforeFrom, beforeTo).clicks; const sa = reader.gscTotals(afterFrom, afterTo).clicks;
  let verdict: string;
  if (afterTo > addDays(today, -2)) verdict = `Too early: the 28 day window ends ${afterTo}, and Search Console runs about two days behind.`;
  else if (before.impressions < 30 && after.impressions < 30) verdict = 'Too little data: fewer than 30 impressions in both windows.';
  else {
    const siteMove = sb === 0 ? 1 : sa / sb;
    const expected = before.clicks * siteMove; const diff = after.clicks - expected;
    verdict = Math.abs(diff) < 5 || expected === 0 && after.clicks < 5 ? 'No clear change against how the whole site moved.' : diff > 0 ? 'Better than the site-wide movement explains (not proof of cause).' : 'Worse than the site-wide movement explains (not proof of cause).';
  }
  return { page, publishedOn, before, after, siteClicksBefore: sb, siteClicksAfter: sa, verdict };
}
