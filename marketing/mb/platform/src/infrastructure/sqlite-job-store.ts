import type { JobRunStore } from '../application/run-due-jobs.ts';
import type { JobRun } from '../domain/jobs.ts';
import type { Db } from './db.ts';

export class SqliteJobRunStore implements JobRunStore {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  last(name: string): JobRun | undefined {
    const row = this.db.prepare('SELECT started_at, status FROM job_runs WHERE name = ? ORDER BY started_at DESC LIMIT 1').get(name);
    if (row === undefined) return undefined;
    const status = String(row['status']);
    if (status !== 'running' && status !== 'ok' && status !== 'failed') throw new Error(`bad job status: ${status}`);
    return { startedAt: new Date(String(row['started_at'])), status };
  }

  start(name: string, at: Date): string {
    const id = crypto.randomUUID();
    this.db.prepare("INSERT INTO job_runs (id, name, started_at, status) VALUES (?, ?, ?, 'running')").run(id, name, at.toISOString());
    return id;
  }

  finish(runId: string, at: Date, status: 'ok' | 'failed', error?: string): void {
    this.db.prepare('UPDATE job_runs SET finished_at = ?, status = ?, error = ? WHERE id = ?').run(at.toISOString(), status, error ?? null, runId);
  }
}
