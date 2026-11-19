import { err, ok, type GoogleAuth, type Result } from '@mb/platform';
import { parseLeads, type Lead, type LeadsPort } from '../domain/lead.ts';
import { parseOutcomes, type Outcome, type OutcomesPort } from '../domain/outcome.ts';

export interface GoogleSheetsOptions {
  readonly sheetId: string;
  readonly auth: GoogleAuth;
  readonly fetch: (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

// Reads new enquiries from the Google Sheet with the shared service account (read-only scope).
export class GoogleSheetsLeads implements LeadsPort {
  private readonly o: GoogleSheetsOptions;

  constructor(options: GoogleSheetsOptions) {
    this.o = options;
  }

  async list(): Promise<Result<Lead[], string>> {
    const token = await this.o.auth.token(SCOPE);
    if (!token.ok) return err(token.error);
    const res = await this.o.fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.o.sheetId}/values/${encodeURIComponent('Enquiries!A1:V5000')}`, { headers: { Authorization: `Bearer ${token.value}` } });
    const who = this.o.auth.clientEmail();
    if (res.status === 403) return err(`Google says no. Share the sheet with ${who.ok ? who.value : 'the service account'} (Viewer is enough).`);
    if (res.status === 404) return err('The sheet or its "Enquiries" tab was not found. Check the sheet id and run setup in the lead script.');
    if (!res.ok) return err(`Google answered with status ${String(res.status)}.`);
    return ok(parseLeads(((await res.json()) as { values?: string[][] }).values ?? []));
  }
}

// Reads what the CRM reported for each enquiry (the "Lead outcomes" tab). A missing tab is not an error: the CRM simply has not reported yet.
export class GoogleSheetsOutcomes implements OutcomesPort {
  private readonly o: GoogleSheetsOptions;

  constructor(options: GoogleSheetsOptions) {
    this.o = options;
  }

  async list(): Promise<Result<Outcome[], string>> {
    const token = await this.o.auth.token(SCOPE);
    if (!token.ok) return err(token.error);
    const res = await this.o.fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.o.sheetId}/values/${encodeURIComponent("'Lead outcomes'!A1:G20000")}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (res.status === 403) { const who = this.o.auth.clientEmail(); return err(`Google says no. Share the sheet with ${who.ok ? who.value : 'the service account'} (Viewer is enough).`); }
    if (res.status === 400 || res.status === 404) return ok([]);
    if (!res.ok) return err(`Google answered with status ${String(res.status)}.`);
    return ok(parseOutcomes(((await res.json()) as { values?: string[][] }).values ?? []));
  }
}
