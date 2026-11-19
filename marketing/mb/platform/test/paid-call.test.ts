import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeClock, SqlitePaidCallStore, err, istMonthRange, migrate, ok, openDb, platformMigrations, runPaidCall, usdToMicro,
  type Result,
} from '../src/index.ts';

let clock: FakeClock;
let store: SqlitePaidCallStore;
let calls: number;
const req = { provider: 'dataforseo', operation: 'serp', requestKey: 'nift coaching kochi', estimateMicroUsd: usdToMicro(0.6), maxAgeDays: 30 };
const exec = (cost = usdToMicro(0.6)) => (): Promise<Result<{ payload: unknown; costMicroUsd: number }, string>> => {
  calls++;
  return Promise.resolve(ok({ payload: { rank: 3 }, costMicroUsd: cost }));
};
const deps = (capUsd: number) => ({ store, clock, capMicroUsd: usdToMicro(capUsd) });

beforeEach(() => {
  clock = new FakeClock('2026-10-14T06:00:00Z');
  const db = openDb(':memory:');
  migrate(db, platformMigrations, clock);
  store = new SqlitePaidCallStore(db);
  calls = 0;
});

describe('runPaidCall', () => {
  it('calls once, then reuses the saved answer for free within the age limit', async () => {
    const first = await runPaidCall(deps(10), req, exec());
    const second = await runPaidCall(deps(10), req, exec());
    expect(first).toEqual({ ok: true, value: { payload: { rank: 3 }, cached: false } });
    expect(second).toEqual({ ok: true, value: { payload: { rank: 3 }, cached: true } });
    expect(calls).toBe(1);
  });

  it('calls again once the saved answer is too old', async () => {
    await runPaidCall(deps(10), req, exec());
    clock.advanceMinutes(31 * 24 * 60);
    const again = await runPaidCall(deps(10), req, exec());
    expect(again.ok && again.value.cached).toBe(false);
    expect(calls).toBe(2);
  });

  it('refuses a call that would pass the monthly cap, without calling', async () => {
    await runPaidCall(deps(1), req, exec());
    const blocked = await runPaidCall(deps(1), { ...req, requestKey: 'other' }, exec());
    expect(blocked).toEqual({ ok: false, error: { kind: 'over-cap', spentMicroUsd: usdToMicro(0.6), capMicroUsd: usdToMicro(1) } });
    expect(calls).toBe(1);
  });

  it('starts a fresh budget on the 1st, India time', async () => {
    await runPaidCall(deps(1), req, exec());
    clock.advanceMinutes(18 * 24 * 60);
    const next = await runPaidCall(deps(1), { ...req, requestKey: 'november' }, exec());
    expect(next.ok).toBe(true);
  });

  it('records nothing and charges nothing when the call fails', async () => {
    const failed = await runPaidCall(deps(10), req, () => Promise.resolve(err('timeout')));
    expect(failed).toEqual({ ok: false, error: { kind: 'failed', message: 'timeout' } });
    expect(store.totalMicroUsd(new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'))).toBe(0);
  });
});

describe('istMonthRange', () => {
  it('switches month at midnight India time, not UTC', () => {
    expect(istMonthRange(new Date('2026-10-31T18:29:00Z')).start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(istMonthRange(new Date('2026-10-31T18:31:00Z')).start.toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });
});
