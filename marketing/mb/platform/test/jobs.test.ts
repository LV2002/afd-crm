import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeClock, SqliteJobRunStore, createLogger, err, isDue, migrate, ok, openDb, platformMigrations, runDueJobs,
  type JobDef, type JobRun, type Result,
} from '../src/index.ts';

const job = (run: () => Promise<Result<void, string>>, name = 'sync'): JobDef => ({ name, everyMinutes: 15, timeoutMinutes: 30, run });
const at = (iso: string, status: JobRun['status']): JobRun => ({ startedAt: new Date(iso), status });
const now = new Date('2026-10-14T06:00:00Z');

describe('isDue', () => {
  const j = job(() => Promise.resolve(ok(undefined)));

  it('runs a job that never ran', () => {
    expect(isDue(j, undefined, now)).toBe(true);
  });

  it('waits for the interval', () => {
    expect(isDue(j, at('2026-10-14T05:50:00Z', 'ok'), now)).toBe(false);
    expect(isDue(j, at('2026-10-14T05:45:00Z', 'ok'), now)).toBe(true);
  });

  it('does not overlap a run that is still within its timeout', () => {
    expect(isDue(j, at('2026-10-14T05:40:00Z', 'running'), now)).toBe(false);
  });

  it('treats a run past its timeout as crashed and runs again', () => {
    expect(isDue(j, at('2026-10-14T05:20:00Z', 'running'), now)).toBe(true);
  });

  it('after a long sleep runs once, not once per missed slot', () => {
    expect(isDue(j, at('2026-10-10T05:00:00Z', 'ok'), now)).toBe(true);
  });
});

describe('runDueJobs', () => {
  const clock = new FakeClock('2026-10-14T06:00:00Z');
  const lines: string[] = [];
  const log = createLogger({ clock, write: (l) => lines.push(l), secrets: [] });
  let store: SqliteJobRunStore;
  let db: ReturnType<typeof openDb>;

  beforeEach(() => {
    lines.length = 0;
    db = openDb(':memory:');
    migrate(db, platformMigrations, clock);
    store = new SqliteJobRunStore(db);
  });

  const statuses = (): unknown[] => db.prepare('SELECT name, status, error FROM job_runs ORDER BY started_at').all().map((r) => ({ ...r }));

  it('records a successful run and does not repeat it before the interval', async () => {
    let calls = 0;
    const j = job(() => { calls++; return Promise.resolve(ok(undefined)); });
    await runDueJobs([j], store, clock, log);
    await runDueJobs([j], store, clock, log);
    expect(calls).toBe(1);
    expect(statuses()).toEqual([{ name: 'sync', status: 'ok', error: null }]);
  });

  it('runs again after the interval', async () => {
    let calls = 0;
    const j = job(() => { calls++; return Promise.resolve(ok(undefined)); });
    await runDueJobs([j], store, clock, log);
    clock.advanceMinutes(16);
    await runDueJobs([j], store, clock, log);
    expect(calls).toBe(2);
  });

  it('records an expected failure and a crash, and still runs the next job', async () => {
    let reached = false;
    await runDueJobs([
      job(() => Promise.resolve(err('platform said no')), 'a'),
      job(() => Promise.reject(new Error('bug')), 'b'),
      job(() => { reached = true; return Promise.resolve(ok(undefined)); }, 'c'),
    ], store, clock, log);
    expect(reached).toBe(true);
    expect(statuses()).toEqual([
      { name: 'a', status: 'failed', error: 'platform said no' },
      { name: 'b', status: 'failed', error: 'bug' },
      { name: 'c', status: 'ok', error: null },
    ]);
    expect(lines).toHaveLength(2);
  });
});
