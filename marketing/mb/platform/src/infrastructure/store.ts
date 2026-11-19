import type { Clock } from '../domain/clock.ts';
import type { Db } from './db.ts';

export interface AuditEntry {
  readonly actor: string;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

function assertIdentifier(name: string): void {
  // Table names are interpolated into SQL, so only plain identifiers from our own code are accepted.
  if (!IDENTIFIER.test(name)) throw new Error(`bad table name: ${name}`);
}

// Every write goes through here so the audit row and the change commit or fail together (rule 11),
// and nothing is ever hard-deleted.
export class Store {
  readonly db: Db;
  private readonly clock: Clock;
  private depth = 0;

  constructor(db: Db, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  transaction<T>(fn: () => T): T {
    const top = this.depth === 0;
    const savepoint = `sp${this.depth}`;
    this.db.exec(top ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    this.depth++;
    try {
      const out = fn();
      this.depth--;
      this.db.exec(top ? 'COMMIT' : `RELEASE ${savepoint}`);
      return out;
    } catch (cause) {
      this.depth--;
      this.db.exec(top ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}`);
      throw cause;
    }
  }

  audited<T>(entry: AuditEntry, change: () => T): T {
    return this.transaction(() => {
      const out = change();
      this.db
        .prepare('INSERT INTO audit_log (id, at, actor, action, entity, entity_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          crypto.randomUUID(), this.clock.now().toISOString(), entry.actor, entry.action, entry.entity, entry.entityId,
          entry.before === undefined ? null : JSON.stringify(entry.before),
          entry.after === undefined ? null : JSON.stringify(entry.after),
        );
      return out;
    });
  }

  // Requires the table to have `id` and `deleted_at` columns; protectFromDelete blocks the real DELETE.
  softDelete(table: string, entry: Omit<AuditEntry, 'action' | 'after'>): void {
    assertIdentifier(table);
    this.audited({ ...entry, action: 'delete' }, () => {
      this.db.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).run(this.clock.now().toISOString(), entry.entityId);
    });
  }
}

// Call from a migration-time helper for every table that holds business data.
export function protectFromDelete(db: Db, table: string): void {
  assertIdentifier(table);
  db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'hard delete is not allowed: use softDelete'); END;`);
}
