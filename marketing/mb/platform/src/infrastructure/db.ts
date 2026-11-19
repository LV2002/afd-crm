import { DatabaseSync } from 'node:sqlite';
import type { Clock } from '../domain/clock.ts';

export type Db = DatabaseSync;

export interface Migration {
  readonly id: string;
  readonly sql: string;
}

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  return db;
}

// Applies each migration once, in order, each in its own transaction. Returns the ids applied now.
export function migrate(db: Db, migrations: readonly Migration[], clock: Clock): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT id FROM _migrations').all().map((r) => String(r['id'])));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(m.id, clock.now().toISOString());
      db.exec('COMMIT');
    } catch (cause) {
      db.exec('ROLLBACK');
      throw cause;
    }
    applied.push(m.id);
  }
  return applied;
}
