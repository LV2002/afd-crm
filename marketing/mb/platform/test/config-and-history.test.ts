import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AuditReader, BudgetConfigSchema, FakeClock, SqlitePaidCallStore, Store, migrate, openDb, platformMigrations, saveConfig, runPaidCall, ok, usdToMicro } from '../src/index.ts';

let store: Store;
let reader: AuditReader;
let dir: string;
beforeEach(() => {
  const clock = new FakeClock('2026-10-14T06:00:00Z');
  const db = openDb(':memory:');
  migrate(db, platformMigrations, clock);
  store = new Store(db, clock);
  reader = new AuditReader(db);
  dir = mkdtempSync(join(tmpdir(), 'cfg-'));
});

describe('saveConfig', () => {
  const schema = z.object({ items: z.array(z.string()) });

  it('writes the checked value, and records before and after in the history', () => {
    const file = join(dir, 'a.json');
    writeFileSync(file, '{"items":["old"]}');
    const r = saveConfig(store, { path: file, schema, raw: { items: ['new'], extra: 'dropped' }, actor: 'owner', entity: 'config' });
    expect(r).toEqual({ ok: true, value: { items: ['new'] } });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ items: ['new'] });
    const [row] = reader.list(5);
    expect(row).toMatchObject({ actor: 'owner', action: 'update', entity: 'config', before: { items: ['old'] }, after: { items: ['new'] } });
  });

  it('refuses an invalid value and leaves the file and the history alone', () => {
    const file = join(dir, 'b.json');
    writeFileSync(file, '{"items":["old"]}');
    const r = saveConfig(store, { path: file, schema, raw: { items: 'nope' }, actor: 'owner', entity: 'config' });
    expect(r.ok).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe('{"items":["old"]}');
    expect(reader.list(5)).toEqual([]);
  });

  it('rolls the history back if the file cannot be written', () => {
    expect(() => saveConfig(store, { path: join(dir, 'missing-folder', 'c.json'), schema, raw: { items: [] }, actor: 'owner', entity: 'config' })).toThrow();
    expect(reader.list(5)).toEqual([]);
  });
});

describe('AuditReader', () => {
  it('lists newest first and can filter by what changed', () => {
    store.audited({ actor: 'a', action: 'create', entity: 'fact', entityId: '1' }, () => {});
    store.audited({ actor: 'a', action: 'update', entity: 'config', entityId: 'x' }, () => {});
    expect(reader.list(10).map((r) => r.entity)).toEqual(['config', 'fact']);
    expect(reader.list(10, 'fact')).toHaveLength(1);
    expect(reader.entities()).toEqual(['config', 'fact']);
  });
});

describe('budget and spend', () => {
  it('a cap of 0 switches paid data off', async () => {
    const db = openDb(':memory:');
    const clock = new FakeClock('2026-10-14T06:00:00Z');
    migrate(db, platformMigrations, clock);
    const paid = new SqlitePaidCallStore(db);
    const blocked = await runPaidCall({ store: paid, clock, capMicroUsd: usdToMicro(BudgetConfigSchema.parse({ monthlyCapUsd: 0 }).monthlyCapUsd) }, { provider: 'dataforseo', operation: 'serp', requestKey: 'k', estimateMicroUsd: 1, maxAgeDays: 30 }, () => Promise.resolve(ok({ payload: 1, costMicroUsd: 1 })));
    expect(blocked.ok).toBe(false);
  });

  it('adds up spend by provider', async () => {
    const db = openDb(':memory:');
    const clock = new FakeClock('2026-10-14T06:00:00Z');
    migrate(db, platformMigrations, clock);
    const paid = new SqlitePaidCallStore(db);
    for (const [provider, key, cost] of [['dataforseo', 'a', 0.6], ['dataforseo', 'b', 0.4], ['llm', 'c', 0.05]] as const) {
      await runPaidCall({ store: paid, clock, capMicroUsd: usdToMicro(5) }, { provider, operation: 'x', requestKey: key, estimateMicroUsd: usdToMicro(cost), maxAgeDays: 30 }, () => Promise.resolve(ok({ payload: 1, costMicroUsd: usdToMicro(cost) })));
    }
    expect(paid.totalsByProvider(new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'))).toEqual([{ provider: 'dataforseo', costMicroUsd: usdToMicro(1), calls: 2 }, { provider: 'llm', costMicroUsd: usdToMicro(0.05), calls: 1 }]);
  });
});
