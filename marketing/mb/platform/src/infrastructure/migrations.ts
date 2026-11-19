import type { Migration } from './db.ts';

export const platformMigrations: readonly Migration[] = [
  {
    id: 'platform-001-audit-and-jobs',
    sql: `
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
        entity TEXT NOT NULL, entity_id TEXT NOT NULL, before_json TEXT, after_json TEXT
      );
      CREATE INDEX audit_entity ON audit_log (entity, entity_id);
      -- The audit trail is append-only (CLAUDE.md rule 11).
      CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
      CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

      -- Operational log of job runs. It is itself the record, so it carries no separate audit rows.
      CREATE TABLE job_runs (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
        status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed')), error TEXT
      );
      CREATE INDEX job_runs_name ON job_runs (name, started_at);
    `,
  },
  {
    id: 'platform-002-paid-calls',
    sql: `
      -- Evidence and spend ledger for every paid call: cost, and the raw answer kept for reuse. Append-only.
      CREATE TABLE paid_call (
        id TEXT PRIMARY KEY, at TEXT NOT NULL, provider TEXT NOT NULL, operation TEXT NOT NULL,
        request_key TEXT NOT NULL, cost_micro_usd INTEGER NOT NULL CHECK (cost_micro_usd >= 0), payload TEXT NOT NULL
      );
      CREATE INDEX paid_call_key ON paid_call (provider, request_key, at);
      CREATE INDEX paid_call_at ON paid_call (at);
      CREATE TRIGGER paid_call_no_update BEFORE UPDATE ON paid_call BEGIN SELECT RAISE(ABORT, 'paid_call is append-only'); END;
      CREATE TRIGGER paid_call_no_delete BEFORE DELETE ON paid_call BEGIN SELECT RAISE(ABORT, 'paid_call is append-only'); END;
    `,
  },
  {
    id: 'platform-003-tasks',
    sql: `
      -- Long jobs the owner starts from the app. Operational log, like job_runs: it is itself the record.
      CREATE TABLE task (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, input TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
        progress_pct INTEGER NOT NULL DEFAULT 0, progress_note TEXT NOT NULL DEFAULT '',
        result TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0, not_before TEXT,
        created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
      );
      CREATE INDEX task_queue ON task (status, created_at);
    `,
  },
  {
    id: 'platform-004-kv',
    sql: `
      -- Small pieces of app state that are not business data (for example which guide steps are ticked).
      CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `,
  },
];
