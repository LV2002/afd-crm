import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, Store, migrate, openDb, platformMigrations, protectFromDelete, type Db } from '../src/index.ts';

let db: Db;
let store: Store;
const clock = new FakeClock('2026-10-14T06:00:00Z');

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db, platformMigrations, clock);
  db.exec('CREATE TABLE note (id TEXT PRIMARY KEY, body TEXT NOT NULL, deleted_at TEXT)');
  protectFromDelete(db, 'note');
  store = new Store(db, clock);
});

const audits = (): Record<string, unknown>[] => db.prepare('SELECT * FROM audit_log ORDER BY at').all();
const insert = (id: string): void => {
  store.audited({ actor: 'owner', action: 'create', entity: 'note', entityId: id, after: { id } }, () => {
    db.prepare('INSERT INTO note (id, body) VALUES (?, ?)').run(id, 'hello');
  });
};

describe('migrate', () => {
  it('applies each migration once', () => {
    expect(migrate(db, platformMigrations, clock)).toEqual([]);
  });

  it('rolls back a failing migration and leaves no record', () => {
    expect(() => migrate(db, [{ id: 'bad', sql: 'CREATE TABLE ok_t (a); SELECT nope FROM nowhere;' }], clock)).toThrow();
    expect(db.prepare("SELECT id FROM _migrations WHERE id = 'bad'").get()).toBeUndefined();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'ok_t'").get()).toBeUndefined();
  });
});

describe('audited', () => {
  it('writes the change and its audit row together', () => {
    insert('n1');
    expect(audits()).toHaveLength(1);
    expect(audits()[0]).toMatchObject({ actor: 'owner', action: 'create', entity: 'note', entity_id: 'n1', at: '2026-10-14T06:00:00.000Z' });
  });

  it('leaves neither when the change throws', () => {
    expect(() => store.audited({ actor: 'owner', action: 'create', entity: 'note', entityId: 'n2' }, () => {
      db.prepare('INSERT INTO note (id, body) VALUES (?, ?)').run('n2', 'x');
      throw new Error('boom');
    })).toThrow('boom');
    expect(db.prepare('SELECT * FROM note').all()).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it('rolls back only the inner step of a nested transaction', () => {
    store.transaction(() => {
      insert('outer');
      expect(() => store.transaction(() => { insert('inner'); throw new Error('inner failed'); })).toThrow();
    });
    expect(db.prepare('SELECT id FROM note').all().map((r) => r['id'])).toEqual(['outer']);
    expect(audits()).toHaveLength(1);
  });
});

describe('nothing is hard deleted', () => {
  it('soft delete marks the row and audits it', () => {
    insert('n3');
    store.softDelete('note', { actor: 'owner', entity: 'note', entityId: 'n3' });
    expect(db.prepare("SELECT deleted_at FROM note WHERE id = 'n3'").get()).toEqual({ deleted_at: '2026-10-14T06:00:00.000Z' });
    expect(audits().map((a) => a['action'])).toEqual(['create', 'delete']);
  });

  it('refuses a real DELETE on a protected table', () => {
    insert('n4');
    expect(() => { db.exec("DELETE FROM note WHERE id = 'n4'"); }).toThrow(/hard delete/);
  });

  it('keeps the audit trail append-only', () => {
    insert('n5');
    expect(() => { db.exec('DELETE FROM audit_log'); }).toThrow(/append-only/);
    expect(() => { db.exec("UPDATE audit_log SET actor = 'x'"); }).toThrow(/append-only/);
  });

  it('rejects an unsafe table name', () => {
    expect(() => { store.softDelete('note; DROP TABLE note', { actor: 'a', entity: 'note', entityId: '1' }); }).toThrow(/bad table name/);
  });
});
