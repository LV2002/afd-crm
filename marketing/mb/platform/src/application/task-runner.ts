import type { Clock } from '../domain/clock.ts';
import type { Logger } from '../domain/logger.ts';
import { err, ok, type Result } from '../domain/result.ts';
import type { TaskFailure, TaskRow } from '../domain/task.ts';

// Port: where tasks are remembered. A task is a long job the owner started from the app.
export interface TaskStore {
  insert(kind: string, input: unknown, at: Date): string;
  // Oldest queued task that is due, marked running with one more attempt.
  claimNext(now: Date): TaskRow | undefined;
  setProgress(id: string, pct: number, note: string): void;
  finish(id: string, at: Date, result: unknown): void;
  fail(id: string, at: Date, error: string): void;
  requeue(id: string, notBefore: Date | undefined): void;
  recoverRunning(): number;
  get(id: string): TaskRow | undefined;
  list(limit: number): TaskRow[];
}

export interface TaskContext {
  readonly input: unknown;
  progress(pct: number, note: string): void;
}
export type TaskHandler = (ctx: TaskContext) => Promise<Result<unknown, TaskFailure>>;

const MAX_ATTEMPTS = 3;

// Runs the owner's long jobs one at a time, so pages never wait on them. A task survives a restart (it is put back in
// the queue) and a temporary failure (it waits until the time the handler names) instead of being lost.
export class TaskRunner {
  private readonly store: TaskStore;
  private readonly clock: Clock;
  private readonly log: Logger;
  private readonly handlers: Readonly<Record<string, TaskHandler>>;

  constructor(store: TaskStore, clock: Clock, log: Logger, handlers: Readonly<Record<string, TaskHandler>>) {
    this.store = store;
    this.clock = clock;
    this.log = log;
    this.handlers = handlers;
  }

  enqueue(kind: string, input: unknown): Result<string, 'unknown-kind'> {
    return kind in this.handlers ? ok(this.store.insert(kind, input, this.clock.now())) : err('unknown-kind');
  }

  // Call once at start-up: anything left "running" by a stopped program goes back in the queue.
  recover(): number {
    return this.store.recoverRunning();
  }

  // Runs one due task. Returns false when nothing was due.
  async runNext(): Promise<boolean> {
    const task = this.store.claimNext(this.clock.now());
    if (task === undefined) return false;
    const handler = this.handlers[task.kind];
    if (handler === undefined) { this.store.fail(task.id, this.clock.now(), `no handler for ${task.kind}`); return true; }
    try {
      const done = await handler({ input: task.input, progress: (pct, note) => { this.store.setProgress(task.id, Math.max(0, Math.min(100, Math.round(pct))), note); } });
      if (done.ok) this.store.finish(task.id, this.clock.now(), done.value);
      else if (done.error.retryAt !== undefined && task.attempts < MAX_ATTEMPTS) this.store.requeue(task.id, done.error.retryAt);
      else this.store.fail(task.id, this.clock.now(), done.error.message);
    } catch (cause) {
      // A throw is a bug in the handler: record it plainly and keep the worker alive.
      const message = cause instanceof Error ? cause.message : 'unknown error';
      this.log.error('task crashed', { task: task.kind, error: message });
      this.store.fail(task.id, this.clock.now(), message);
    }
    return true;
  }
}
