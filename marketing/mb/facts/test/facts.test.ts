import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, Store, migrate, openDb, platformMigrations, type Db } from '@mb/platform';
import { FactSchema, FactStore, factMigrations, loadFactSeed, protectFacts, resolveFacts, resolveFactsLive, factIdsIn, type Fact } from '../src/index.ts';

const fact = (over: Partial<Fact> = {}): Fact => ({
  id: 'uceed-2027-exam-date', exam: 'UCEED', label: 'exam date', value: 'Sunday 17 January 2027', source: 'brochure', status: 'official', ...over,
});

let db: Db;
let facts: FactStore;
beforeEach(() => {
  const clock = new FakeClock('2026-10-14T06:00:00Z');
  db = openDb(':memory:');
  migrate(db, [...platformMigrations, ...factMigrations], clock);
  protectFacts(db);
  facts = new FactStore(new Store(db, clock));
});

describe('resolveFacts', () => {
  const lookup = (...f: Fact[]): Map<string, Fact> => new Map(f.map((x) => [x.id, x]));

  it('fills in usable facts from the table', () => {
    const r = resolveFacts('UCEED is on {{fact:uceed-2027-exam-date}}.', lookup(fact()));
    expect(r).toEqual({ ok: true, value: 'UCEED is on Sunday 17 January 2027.' });
  });

  it('refuses an unknown fact and an unverified one, listing every problem', () => {
    const r = resolveFacts('{{fact:made-up}} and {{fact:nift}}', lookup(fact({ id: 'nift', status: 'secondary' })));
    expect(r).toEqual({ ok: false, error: [{ kind: 'unknown', id: 'made-up' }, { kind: 'not-usable', id: 'nift', status: 'secondary' }] });
  });

  it('accepts owner-verified facts and rejects pending ones', () => {
    expect(resolveFacts('{{fact:a}}', lookup(fact({ id: 'a', status: 'owner_verified' }))).ok).toBe(true);
    expect(resolveFacts('{{fact:a}}', lookup(fact({ id: 'a', status: 'pending' }))).ok).toBe(false);
  });

  it('lists the fact ids a text uses', () => {
    expect(factIdsIn('{{fact:a}} then {{fact:b-2}}')).toEqual(['a', 'b-2']);
  });
});

describe('FactStore', () => {
  it('seeds once and a second seed changes nothing', () => {
    expect(facts.seed([fact()], 'seed').added).toEqual(['uceed-2027-exam-date']);
    expect(facts.seed([fact()], 'seed')).toEqual({ added: [], updated: [], keptOwnerVerified: [] });
  });

  it('updates a changed fact and writes an audit row', () => {
    facts.seed([fact()], 'seed');
    expect(facts.seed([fact({ value: 'Sunday 17 January 2027, 9 am' })], 'seed').updated).toHaveLength(1);
    expect(db.prepare("SELECT action FROM audit_log WHERE entity = 'fact' ORDER BY at, rowid").all().map((r) => r['action'])).toEqual(['create', 'update']);
  });

  it('never overwrites a fact the owner verified', () => {
    facts.seed([fact()], 'seed');
    expect(facts.verify('uceed-2027-exam-date', 'owner')).toBe(true);
    const r = facts.seed([fact({ value: 'something else' })], 'seed');
    expect(r.keptOwnerVerified).toEqual(['uceed-2027-exam-date']);
    expect(facts.all().get('uceed-2027-exam-date')?.value).toBe('Sunday 17 January 2027');
  });

  it('cannot verify a pending or missing fact, and cannot hard delete', () => {
    facts.seed([fact({ id: 'later', status: 'pending' })], 'seed');
    expect(facts.verify('later', 'owner')).toBe(false);
    expect(facts.verify('nope', 'owner')).toBe(false);
    expect(() => { db.exec('DELETE FROM fact'); }).toThrow(/hard delete/);
  });
});

describe('the real seed file', () => {
  it('is valid, has unique ids, and only official facts say official', () => {
    const r = loadFactSeed(new URL('../../../config/facts.seed.json', import.meta.url).pathname);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new Set(r.value.map((f) => f.id)).size).toBe(r.value.length);
    expect(r.value.filter((f) => f.status === 'pending').every((f) => /not|expected|announced/i.test(f.value))).toBe(true);
  });
});

describe('dated facts', () => {
  it('keep their date through the store, and a bad date is refused', () => {
    facts.seed([fact({ date: '2026-10-31' })], 'seed');
    expect(facts.all().get('uceed-2027-exam-date')?.date).toBe('2026-10-31');
    expect(FactSchema.safeParse({ ...fact(), date: '31 October' }).success).toBe(false);
    expect(loadFactSeed(new URL('../../../config/facts.seed.json', import.meta.url).pathname).ok).toBe(true);
  });
});

describe('owner edits', () => {
  it('adds a new fact and corrects an old one, both as owner-verified, with history', () => {
    facts.save({ id: 'new-fact', exam: 'NIFT', label: 'NIFT 2027 exam', value: '10 January 2027', source: 'NTA notice', date: '2027-01-10' }, 'owner');
    facts.seed([fact()], 'seed');
    facts.save({ id: 'uceed-2027-exam-date', exam: 'UCEED', label: 'exam date', value: 'Sunday 17 January 2027, 9 am', source: 'brochure' }, 'owner');
    const all = facts.all();
    expect(all.get('new-fact')).toMatchObject({ status: 'owner_verified', date: '2027-01-10' });
    expect(all.get('uceed-2027-exam-date')).toMatchObject({ status: 'owner_verified', value: 'Sunday 17 January 2027, 9 am' });
    expect(db.prepare("SELECT action FROM audit_log WHERE entity = 'fact' AND entity_id = 'uceed-2027-exam-date' ORDER BY rowid").all().map((r) => r['action'])).toEqual(['create', 'update']);
  });
});

describe('resolveFactsLive', () => {
  const table = new Map([['uceed-2027-exam-date', fact()], ['unconfirmed', fact({ id: 'unconfirmed', status: 'secondary' })]]);

  it('wraps each confirmed value in a tag the website can refresh', () => {
    expect(resolveFactsLive('The exam is on {{fact:uceed-2027-exam-date}}.', table)).toEqual({ ok: true, value: 'The exam is on <span data-afd-fact="uceed-2027-exam-date">Sunday 17 January 2027</span>.' });
  });

  it('escapes the value, and refuses unknown or unconfirmed facts just like the plain fill-in', () => {
    const odd = new Map([['a-b', fact({ id: 'a-b', value: '<b>& "x"</b>' })]]);
    expect(resolveFactsLive('{{fact:a-b}}', odd)).toEqual({ ok: true, value: '<span data-afd-fact="a-b">&#60;b&#62;&#38; &#34;x&#34;&#60;/b&#62;</span>' });
    expect(resolveFactsLive('{{fact:nope}} {{fact:unconfirmed}}', table)).toEqual({ ok: false, error: [{ kind: 'unknown', id: 'nope' }, { kind: 'not-usable', id: 'unconfirmed', status: 'secondary' }] });
  });
});
