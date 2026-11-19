import type { Result } from '@mb/platform';
import { z } from 'zod';

// What the CRM reports for an enquiry. One row per change; the newest meaningful row says where the enquiry stands now.
export interface Outcome {
  readonly submissionId: string;
  readonly status: string;
  readonly at: Date;
  readonly revenueInr: number | undefined;
  readonly note: string;
}

// Port: where the CRM's reports are read from (the "Lead outcomes" tab of the same sheet).
export interface OutcomesPort { list(): Promise<Result<Outcome[], string>> }

// The body the CRM signs and sends. Written down once here so the CRM's developer and the receiving script agree.
export const OutcomePayloadSchema = z.object({
  version: z.literal(1),
  events: z.array(z.object({
    submission_id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    status: z.string().regex(/^[a-z][a-z_]{1,29}$/),
    event_at: z.iso.datetime({ offset: true }),
    revenue_inr: z.number().min(0).max(10_000_000).optional(),
    note: z.string().max(200).optional(),
  })).min(1).max(200),
});
export type OutcomePayload = z.infer<typeof OutcomePayloadSchema>;

export function parseOutcomes(rows: readonly (readonly string[])[]): Outcome[] {
  const [header, ...body] = rows;
  if (header === undefined) return [];
  const col = (row: readonly string[], name: string): string => row[header.indexOf(name)] ?? '';
  return body.flatMap((row) => {
    const at = new Date(col(row, 'Event at'));
    const sid = col(row, 'Submission ID');
    if (sid === '' || Number.isNaN(at.getTime())) return [];
    const revenue = col(row, 'Revenue INR');
    return [{ submissionId: sid, status: col(row, 'Status'), at, revenueInr: revenue === '' || Number.isNaN(Number(revenue)) ? undefined : Number(revenue), note: col(row, 'Note') }];
  });
}
