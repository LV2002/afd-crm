import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, SqliteTaskStore, TaskRunner, createLogger, err, migrate, ok, openDb, platformMigrations, renderLaunchdPlist, type TaskHandler } from '../src/index.ts';

let clock: FakeClock;
let store: SqliteTaskStore;
const log = (): ReturnType<typeof createLogger> => createLogger({ clock, write: () => {}, secrets: [] });
const runner = (handlers: Record<string, TaskHandler>): TaskRunner => new TaskRunner(store, clock, log(), handlers);

beforeEach(() => {
  clock = new FakeClock('2026-10-14T06:00:00Z');
  const db = openDb(':memory:');
  migrate(db, platformMigrations, clock);
  store = new SqliteTaskStore(db);
});

describe('TaskRunner', () => {
  it('runs a task, records progress and keeps the result', async () => {
    const r = runner({ audit: (ctx) => { ctx.progress(40, 'reading pages'); return Promise.resolve(ok({ pages: 3 })); } });
    const id = r.enqueue('audit', { site: 'afdindia.com' });
    expect(id.ok).toBe(true);
    if (!id.ok) return;
    expect(store.get(id.value)?.status).toBe('queued');
    expect(await r.runNext()).toBe(true);
    const done = store.get(id.value);
    expect(done).toMatchObject({ status: 'done', progressPct: 100, result: { pages: 3 }, input: { site: 'afdindia.com' } });
    expect(await r.runNext()).toBe(false);
  });

  it('refuses a kind it has no handler for', () => {
    expect(runner({}).enqueue('nope', {})).toEqual({ ok: false, error: 'unknown-kind' });
  });

  it('runs tasks oldest first, one at a time', async () => {
    const order: string[] = [];
    const r = runner({ t: (ctx) => { order.push((ctx.input as { n: string }).n); return Promise.resolve(ok(null)); } });
    r.enqueue('t', { n: 'first' });
    clock.advanceMinutes(1);
    r.enqueue('t', { n: 'second' });
    await r.runNext();
    await r.runNext();
    expect(order).toEqual(['first', 'second']);
  });

  it('records a plain failure and a crash, and keeps working', async () => {
    const r = runner({ bad: () => Promise.resolve(err({ message: 'the page was blocked' })), boom: () => Promise.reject(new Error('bug')) });
    const a = r.enqueue('bad', {});
    const b = r.enqueue('boom', {});
    await r.runNext();
    await r.runNext();
    expect(a.ok && store.get(a.value)).toMatchObject({ status: 'failed', error: 'the page was blocked' });
    expect(b.ok && store.get(b.value)).toMatchObject({ status: 'failed', error: 'bug' });
  });

  it('waits and retries when the cause is temporary, then gives up after three attempts', async () => {
    const r = runner({ write: () => Promise.resolve(err({ message: 'plan limit', retryAt: new Date('2026-10-14T09:00:00Z') })) });
    const id = r.enqueue('write', {});
    if (!id.ok) return;
    await r.runNext();
    expect(store.get(id.value)).toMatchObject({ status: 'queued', attempts: 1 });
    expect(await r.runNext()).toBe(false); // not due until 9:00
    clock.advanceMinutes(4 * 60);
    await r.runNext();
    clock.advanceMinutes(4 * 60);
    await r.runNext();
    expect(store.get(id.value)).toMatchObject({ status: 'failed', attempts: 3, error: 'plan limit' });
  });

  it('puts a task left running by a stopped program back in the queue', async () => {
    const r = runner({ t: () => Promise.resolve(ok(null)) });
    const id = r.enqueue('t', {});
    if (!id.ok) return;
    store.claimNext(clock.now()); // started, then the program stopped
    expect(store.get(id.value)?.status).toBe('running');
    expect(r.recover()).toBe(1);
    await r.runNext();
    expect(store.get(id.value)?.status).toBe('done');
  });
});

describe('launchd plist for the web app', () => {
  it('keeps the program running and starts it at login', () => {
    const plist = renderLaunchdPlist({ label: 'in.afd.web', programArguments: ['node', 'main.ts'], keepAlive: true, logPath: '/tmp/x.log' });
    expect(plist).toContain('<key>KeepAlive</key><true/>');
    expect(plist).toContain('<key>RunAtLoad</key><true/>');
    expect(plist).not.toContain('StartInterval');
  });
});
