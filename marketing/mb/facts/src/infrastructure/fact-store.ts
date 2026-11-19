import { protectFromDelete, type Db, type Migration, type Store } from '@mb/platform';
import { FactSchema, type Fact } from '../domain/fact.ts';

export const factMigrations: readonly Migration[] = [
  {
    id: 'facts-001-fact',
    sql: `CREATE TABLE fact (
      id TEXT PRIMARY KEY, exam TEXT NOT NULL, label TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('official', 'owner_verified', 'secondary', 'pending')),
      verified_by TEXT, deleted_at TEXT
    );`,
  },
  { id: 'facts-002-date', sql: 'ALTER TABLE fact ADD COLUMN date TEXT;' },
];

// Call once after migrating.
export const protectFacts = (db: Db): void => { protectFromDelete(db, 'fact'); };

export class FactStore {
  private readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  all(): Map<string, Fact> {
    const rows = this.store.db.prepare('SELECT id, exam, label, value, source, status, date FROM fact WHERE deleted_at IS NULL').all();
    return new Map(rows.map((r) => { const f = FactSchema.parse({ ...r, date: r['date'] ?? undefined }); return [f.id, f]; }));
  }

  // Loads the seed list. New facts are added. A changed fact is updated unless the owner already verified it, so a
  // re-seed can never overwrite something the owner confirmed. Returns what changed.
  seed(facts: readonly Fact[], actor: string): { added: string[]; updated: string[]; keptOwnerVerified: string[] } {
    const have = this.all();
    const out = { added: [] as string[], updated: [] as string[], keptOwnerVerified: [] as string[] };
    for (const f of facts) {
      const current = have.get(f.id);
      if (current === undefined) {
        this.store.audited({ actor, action: 'create', entity: 'fact', entityId: f.id, after: f }, () => {
          this.store.db.prepare('INSERT INTO fact (id, exam, label, value, source, status, date) VALUES (?, ?, ?, ?, ?, ?, ?)').run(f.id, f.exam, f.label, f.value, f.source, f.status, f.date ?? null);
        });
        out.added.push(f.id);
      } else if (current.status === 'owner_verified') {
        if (current.value !== f.value) out.keptOwnerVerified.push(f.id);
      } else if (JSON.stringify(current) !== JSON.stringify(f)) {
        this.store.audited({ actor, action: 'update', entity: 'fact', entityId: f.id, before: current, after: f }, () => {
          this.store.db.prepare('UPDATE fact SET exam = ?, label = ?, value = ?, source = ?, status = ?, date = ? WHERE id = ?').run(f.exam, f.label, f.value, f.source, f.status, f.date ?? null, f.id);
        });
        out.updated.push(f.id);
      }
    }
    return out;
  }

  // The owner adds or corrects a fact in the app. What the owner types is owner-verified by definition.
  save(input: Omit<Fact, 'status'>, by: string): void {
    const fact: Fact = { ...input, status: 'owner_verified' };
    const current = this.all().get(fact.id);
    this.store.audited({ actor: by, action: current === undefined ? 'create' : 'update', entity: 'fact', entityId: fact.id, before: current, after: fact }, () => {
      this.store.db
        .prepare('INSERT INTO fact (id, exam, label, value, source, status, verified_by, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET exam = excluded.exam, label = excluded.label, value = excluded.value, source = excluded.source, status = excluded.status, verified_by = excluded.verified_by, date = excluded.date')
        .run(fact.id, fact.exam, fact.label, fact.value, fact.source, fact.status, by, fact.date ?? null);
    });
  }

  verify(id: string, by: string): boolean {
    const current = this.all().get(id);
    if (current === undefined || current.status === 'pending') return false; // nothing real to confirm yet
    this.store.audited({ actor: by, action: 'verify', entity: 'fact', entityId: id, before: current, after: { ...current, status: 'owner_verified' } }, () => {
      this.store.db.prepare("UPDATE fact SET status = 'owner_verified', verified_by = ? WHERE id = ?").run(by, id);
    });
    return true;
  }
}
