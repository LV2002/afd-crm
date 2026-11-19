import type { Result } from '@mb/platform';

export interface Lead {
  readonly receivedAt: Date | undefined;
  readonly submissionId: string;
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly exam: string;
  readonly page: string;
  readonly form: string;
  // Which block of the page the enquiry came from (inline-1, closing, sheet, slide, strip ...), set by the call to action itself.
  readonly action: string;
  // sent, queued (CRM was down, retrying), rejected (CRM said no), pending
  readonly crmStatus: string;
  // Where the visitor came from, as the page's link said (utm_source and so on). Empty when the visit carried none.
  readonly source: string;
  readonly medium: string;
  readonly campaign: string;
}

// Port: where new enquiries are read from (the Google Sheet the forms write to).
export interface LeadsPort {
  list(): Promise<Result<Lead[], string>>;
}

// Reads the rows of the "Enquiries" tab by the names in its header row, so a moved or added column cannot shift the data.
export function parseLeads(rows: readonly (readonly string[])[]): Lead[] {
  const [header, ...body] = rows;
  if (header === undefined) return [];
  const col = (row: readonly string[], name: string): string => row[header.indexOf(name)] ?? '';
  return body
    .filter((row) => row.some((c) => c !== ''))
    .map((row) => {
      const received = new Date(col(row, 'Received'));
      return {
        receivedAt: Number.isNaN(received.getTime()) ? undefined : received, submissionId: col(row, 'Submission ID'), name: col(row, 'Name'), phone: col(row, 'Phone'),
        email: col(row, 'Email'), exam: col(row, 'Exam'), page: col(row, 'Page'), form: col(row, 'Form'), action: col(row, 'Action'), crmStatus: col(row, 'CRM status'),
        source: col(row, 'utm_source'), medium: col(row, 'utm_medium'), campaign: col(row, 'utm_campaign'),
      };
    })
    .reverse();
}
