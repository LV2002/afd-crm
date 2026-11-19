import type { Db } from './db.ts';

export interface AuditRow {
  readonly at: Date;
  readonly actor: string;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly before: unknown;
  readonly after: unknown;
}

const parse = (v: unknown): unknown => (typeof v === 'string' ? (JSON.parse(v) as unknown) : undefined);

// Reads the history of changes (written by Store.audited) for the History screen.
export class AuditReader {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  list(limit: number, entity?: string): AuditRow[] {
    const rows = entity === undefined
      ? this.db.prepare('SELECT * FROM audit_log ORDER BY at DESC, rowid DESC LIMIT ?').all(limit)
      : this.db.prepare('SELECT * FROM audit_log WHERE entity = ? ORDER BY at DESC, rowid DESC LIMIT ?').all(entity, limit);
    return rows.map((r) => ({
      at: new Date(String(r['at'])), actor: String(r['actor']), action: String(r['action']), entity: String(r['entity']),
      entityId: String(r['entity_id']), before: parse(r['before_json']), after: parse(r['after_json']),
    }));
  }

  entities(): string[] {
    return this.db.prepare('SELECT DISTINCT entity FROM audit_log ORDER BY entity').all().map((r) => String(r['entity']));
  }
}
