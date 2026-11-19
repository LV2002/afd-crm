import { FakeClock, migrate, openDb, platformMigrations } from '@mb/platform';
import { describe, expect, it } from 'vitest';
import { SqlitePageStore, extractPageFacts, pageReaderMigrations } from '../src/index.ts';

const facts = (path: string, body: string) => extractPageFacts(`<html><head><title>T</title></head><body><h1>T</h1><p>${body}</p></body></html>`, `https://afdindia.com${path}`, 200);

describe('page history', () => {
  const db = openDb(':memory:');
  migrate(db, [...platformMigrations, ...pageReaderMigrations], new FakeClock('2026-10-01T00:00:00Z'));
  const store = new SqlitePageStore(db);
  const save = (path: string, body: string, at: string) => { store.save({ path, url: `https://afdindia.com${path}`, fetchedAt: new Date(at), facts: facts(path, body) }); };
  save('/a', 'one', '2026-01-01T00:00:00Z');
  save('/a', 'one', '2026-02-01T00:00:00Z');
  save('/a', 'two', '2026-03-01T00:00:00Z');
  save('/b', 'same', '2026-01-05T00:00:00Z');
  save('/b', 'same', '2026-04-05T00:00:00Z');

  it('knows the day each page was first read', () => {
    expect(store.firstSeenAll().get('/a')?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(store.firstSeenAll().get('/b')?.toISOString()).toBe('2026-01-05T00:00:00.000Z');
  });
  it('knows when a page last changed, and leaves out pages never seen to change', () => {
    expect(store.lastChangedAll().get('/a')?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(store.lastChangedAll().has('/b')).toBe(false);
  });
});
