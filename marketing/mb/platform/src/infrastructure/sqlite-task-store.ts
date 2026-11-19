import type { TaskStore } from '../application/task-runner.ts';
import type { TaskRow, TaskStatus } from '../domain/task.ts';
import type { Db } from './db.ts';

const date = (v: unknown): Date | undefined => (typeof v === 'string' ? new Date(v) : undefined);

function toTask(r: Record<string, unknown>): TaskRow {
  return {
    id: String(r['id']), kind: String(r['kind']), input: JSON.parse(String(r['input'])) as unknown, status: String(r['status']) as TaskStatus,
    progressPct: Number(r['progress_pct']), progressNote: String(r['progress_note']),
    result: typeof r['result'] === 'string' ? (JSON.parse(r['result']) as unknown) : undefined,
    error: typeof r['error'] === 'string' ? r['error'] : undefined, attempts: Number(r['attempts']),
    notBefore: date(r['not_before']), createdAt: new Date(String(r['created_at'])), finishedAt: date(r['finished_at']),
  };
}

export class SqliteTaskStore implements TaskStore {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  insert(kind: string, input: unknown, at: Date): string {
    const id = crypto.randomUUID();
    this.db.prepare("INSERT INTO task (id, kind, input, status, created_at) VALUES (?, ?, ?, 'queued', ?)").run(id, kind, JSON.stringify(input), at.toISOString());
    return id;
  }

  claimNext(now: Date): TaskRow | undefined {
    const row = this.db
      .prepare("SELECT * FROM task WHERE status = 'queued' AND (not_before IS NULL OR not_before <= ?) ORDER BY created_at, rowid LIMIT 1")
      .get(now.toISOString());
    if (row === undefined) return undefined;
    this.db.prepare("UPDATE task SET status = 'running', attempts = attempts + 1, started_at = ?, not_before = NULL WHERE id = ?").run(now.toISOString(), String(row['id']));
    return this.get(String(row['id']));
  }

  setProgress(id: string, pct: number, note: string): void {
    this.db.prepare('UPDATE task SET progress_pct = ?, progress_note = ? WHERE id = ?').run(pct, note, id);
  }

  finish(id: string, at: Date, result: unknown): void {
    this.db.prepare("UPDATE task SET status = 'done', progress_pct = 100, result = ?, finished_at = ? WHERE id = ?").run(JSON.stringify(result ?? null), at.toISOString(), id);
  }

  fail(id: string, at: Date, error: string): void {
    this.db.prepare("UPDATE task SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(error, at.toISOString(), id);
  }

  requeue(id: string, notBefore: Date | undefined): void {
    this.db.prepare("UPDATE task SET status = 'queued', not_before = ? WHERE id = ?").run(notBefore?.toISOString() ?? null, id);
  }

  recoverRunning(): number {
    return Number(this.db.prepare("UPDATE task SET status = 'queued' WHERE status = 'running'").run().changes);
  }

  get(id: string): TaskRow | undefined {
    const row = this.db.prepare('SELECT * FROM task WHERE id = ?').get(id);
    return row === undefined ? undefined : toTask(row);
  }

  list(limit: number): TaskRow[] {
    return this.db.prepare('SELECT * FROM task ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit).map(toTask);
  }
}
