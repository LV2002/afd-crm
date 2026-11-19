import type { Db, Migration } from '@mb/platform';
import type { PageStore } from '../application/run-site-audit.ts';
import { changedFields, type ChangeEvent } from '../domain/change-events.ts';
import type { PageFacts } from '../domain/page-facts.ts';

export const pageReaderMigrations: readonly Migration[] = [
  {
    id: 'page-reader-001-snapshot',
    sql: `
      -- Every reading of a page, kept for before and after comparisons. Append-only.
      CREATE TABLE page_snapshot (
        id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, url TEXT NOT NULL, fetched_at TEXT NOT NULL, facts TEXT NOT NULL
      );
      CREATE INDEX page_snapshot_path ON page_snapshot (path, fetched_at);
      CREATE TRIGGER page_snapshot_no_update BEFORE UPDATE ON page_snapshot BEGIN SELECT RAISE(ABORT, 'page_snapshot is append-only'); END;
      CREATE TRIGGER page_snapshot_no_delete BEFORE DELETE ON page_snapshot BEGIN SELECT RAISE(ABORT, 'page_snapshot is append-only'); END;
    `,
  },
];

export interface Snapshot {
  readonly path: string;
  readonly url: string;
  readonly fetchedAt: Date;
  readonly facts: PageFacts;
}

const toSnapshot = (r: Record<string, unknown>): Snapshot => ({ path: String(r['path']), url: String(r['url']), fetchedAt: new Date(String(r['fetched_at'])), facts: JSON.parse(String(r['facts'])) as PageFacts });

export class SqlitePageStore implements PageStore {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  save(s: Snapshot): void {
    this.db.prepare('INSERT INTO page_snapshot (path, url, fetched_at, facts) VALUES (?, ?, ?, ?)').run(s.path, s.url, s.fetchedAt.toISOString(), JSON.stringify(s.facts));
  }

  // The newest reading of every page.
  latestAll(): Snapshot[] {
    return this.db
      .prepare('SELECT p.* FROM page_snapshot p JOIN (SELECT path, MAX(id) AS id FROM page_snapshot GROUP BY path) m ON m.id = p.id ORDER BY p.path')
      .all()
      .map(toSnapshot);
  }

  // The day each page was first read (snapshots are never deleted), so the site's growth can be drawn.
  firstSeenAll(): Map<string, Date> {
    return new Map(this.db.prepare('SELECT path, MIN(fetched_at) AS first FROM page_snapshot GROUP BY path').all().map((r) => [String(r['path']), new Date(String(r['first']))]));
  }

  // The day each page's title, description or text last changed between two readings. A page never seen to change is left out.
  lastChangedAll(): Map<string, Date> {
    const out = new Map<string, Date>();
    let path = '';
    let before = '';
    for (const r of this.db.prepare('SELECT path, fetched_at, facts FROM page_snapshot ORDER BY path, id').all()) {
      const f = JSON.parse(String(r['facts'])) as PageFacts;
      const sig = `${f.title}|${f.metaDescription}|${f.bodyText}`;
      if (String(r['path']) === path && sig !== before) out.set(path, new Date(String(r['fetched_at'])));
      path = String(r['path']);
      before = sig;
    }
    return out;
  }

  // Every moment a page appeared or changed, oldest first, from the readings kept. Pages are compared reading by reading, so a change made
  // outside this app (a hand edit in Knorish) is found too.
  changeEvents(): ChangeEvent[] {
    const out: ChangeEvent[] = [];
    let path = '';
    let before: PageFacts | undefined;
    for (const r of this.db.prepare('SELECT path, fetched_at, facts FROM page_snapshot ORDER BY path, id').all()) {
      const f = JSON.parse(String(r['facts'])) as PageFacts;
      const at = new Date(String(r['fetched_at']));
      if (String(r['path']) !== path) { path = String(r['path']); out.push({ path, at, first: true, fields: [] }); before = f; continue; }
      const fields = before === undefined ? [] : changedFields(before, f);
      if (fields.length > 0) out.push({ path, at, first: false, fields });
      before = f;
    }
    return out.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  // Readings of one page, newest first.
  history(path: string, limit = 10): Snapshot[] {
    return this.db.prepare('SELECT * FROM page_snapshot WHERE path = ? ORDER BY id DESC LIMIT ?').all(path, limit).map(toSnapshot);
  }
}
