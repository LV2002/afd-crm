import type { Db } from './db.ts';

export class SqliteKv {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  get(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
    return row === undefined ? undefined : String(row['value']);
  }

  set(key: string, value: string): void {
    this.db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  keysWithPrefix(prefix: string): string[] {
    return this.db.prepare('SELECT key FROM kv WHERE key LIKE ? ORDER BY key').all(`${prefix}%`).map((r) => String(r['key']));
  }
}
