import { beforeEach, describe, expect, it } from 'vitest';
import { OutcomePayloadSchema, parseLeads, parseOutcomes, signPublish } from '../src/index.ts';
import { makeGoogleStub, type GoogleStub } from './google-stub.ts';

let g: GoogleStub;
const event = (over: Record<string, unknown> = {}) => ({ submission_id: 'sub-1', status: 'admitted', event_at: '2026-10-20T05:00:00.000Z', revenue_inr: 45000, ...over });
const body = (events: unknown[], secret = 'crm-secret', at = Date.now()) => {
  const payloadJson = JSON.stringify({ version: 1, events });
  return { _afd_publish: 'outcome', timestamp: at, payloadJson, signature: signPublish(secret, at, payloadJson) };
};

beforeEach(() => {
  g = makeGoogleStub(new URL('../apps-script', import.meta.url).pathname);
  g.props['OUTCOMES_SECRET'] = 'crm-secret';
});

describe('the CRM outcome receiver (Apps Script)', () => {
  it('stores a signed report in the Lead outcomes tab', () => {
    expect(g.postJson(body([event(), event({ submission_id: 'sub-2', status: 'contacted', revenue_inr: undefined })]))).toEqual({ ok: true, added: 2, duplicates: 0 });
    const rows = g.sheets.get('Lead outcomes')?.rows ?? [];
    expect(rows[0]).toEqual(['Received', 'Submission ID', 'Status', 'Event at', 'Revenue INR', 'Note', 'Key']);
    expect(rows[1]?.slice(1, 5)).toEqual(['sub-1', 'admitted', '2026-10-20T05:00:00.000Z', 45000]);
    expect(rows[2]?.[4]).toBe('');
  });

  it('ignores an event the CRM sends twice', () => {
    g.postJson(body([event()]));
    expect(g.postJson(body([event(), event({ status: 'lost' })]))).toEqual({ ok: true, added: 1, duplicates: 1 });
    expect(g.sheets.get('Lead outcomes')?.rows).toHaveLength(3);
  });

  it('refuses a wrong key, an old request, a changed body, and a script with no key', () => {
    expect(g.postJson(body([event()], 'wrong'))).toMatchObject({ ok: false, error: 'the signature does not match' });
    expect(g.postJson(body([event()], 'crm-secret', Date.now() - 11 * 60_000))).toMatchObject({ ok: false, error: 'the request is too old, or has no time' });
    const tampered = body([event()]);
    expect(g.postJson({ ...tampered, payloadJson: tampered.payloadJson.replace('45000', '99999') })).toMatchObject({ ok: false, error: 'the signature does not match' });
    g.props['OUTCOMES_SECRET'] = null;
    expect(g.postJson(body([event()]))).toMatchObject({ ok: false });
    expect(g.sheets.get('Lead outcomes')).toBeUndefined();
  });

  it('refuses a malformed event, and stores nothing from a request that has one', () => {
    expect(g.postJson(body([event(), event({ status: 'Admitted!' })]))).toMatchObject({ ok: false });
    expect(g.postJson(body([event({ revenue_inr: -5 })]))).toMatchObject({ ok: false });
    expect(g.postJson(body([event({ submission_id: 'a b' })]))).toMatchObject({ ok: false });
    expect(g.postJson(body([event({ event_at: 'yesterday' })]))).toMatchObject({ ok: false });
    expect(g.sheets.get('Lead outcomes')?.rows.length ?? 1).toBe(1);
  });

  it('does not treat a report as an enquiry', () => {
    g.postJson(body([event()]));
    expect(g.sheets.get('Enquiries')).toBeUndefined();
  });
});

describe('the agreed payload and the reader', () => {
  it('accepts what the receiver accepts', () => {
    expect(OutcomePayloadSchema.safeParse({ version: 1, events: [event()] }).success).toBe(true);
    expect(OutcomePayloadSchema.safeParse({ version: 1, events: [] }).success).toBe(false);
    expect(OutcomePayloadSchema.safeParse({ version: 1, events: [event({ status: 'Bad' })] }).success).toBe(false);
  });

  it('reads the tab by column name, with revenue as a number only when there is one', () => {
    const rows = [['Received', 'Submission ID', 'Status', 'Event at', 'Revenue INR', 'Note', 'Key'], ['x', 'sub-1', 'admitted', '2026-10-20T05:00:00.000Z', '45000', 'paid in full', 'k'], ['x', 'sub-2', 'lost', '2026-10-21T05:00:00.000Z', '', '', 'k2'], ['x', '', 'lost', 'bad date', '', '', 'k3']];
    expect(parseOutcomes(rows)).toEqual([
      { submissionId: 'sub-1', status: 'admitted', at: new Date('2026-10-20T05:00:00.000Z'), revenueInr: 45000, note: 'paid in full' },
      { submissionId: 'sub-2', status: 'lost', at: new Date('2026-10-21T05:00:00.000Z'), revenueInr: undefined, note: '' },
    ]);
    expect(parseOutcomes([])).toEqual([]);
  });

  it('now reads where the visitor came from', () => {
    const rows = [['Received', 'Submission ID', 'Name', 'utm_source', 'utm_medium', 'utm_campaign'], ['2026-10-14T04:00:00.000Z', 's1', 'Asha', 'instagram', 'social', 'nift-reg']];
    expect(parseLeads(rows)[0]).toMatchObject({ source: 'instagram', medium: 'social', campaign: 'nift-reg' });
  });
});
