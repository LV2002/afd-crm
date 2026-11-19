import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { ZodType } from 'zod';
import { parseConfig, type ConfigError } from '../domain/config.ts';
import { err, ok, type Result } from '../domain/result.ts';
import type { Store } from './store.ts';

// Saves a settings file the owner edited in the app: checked against its schema, written safely (a half-written file
// can never replace a good one), and recorded in the history with before and after.
export function saveConfig<T>(store: Store, opts: { path: string; schema: ZodType<T>; raw: unknown; actor: string; entity: string }): Result<T, ConfigError> {
  const checked = parseConfig(opts.schema, opts.raw, opts.path);
  if (!checked.ok) return err(checked.error);
  let before: unknown;
  try { before = JSON.parse(readFileSync(opts.path, 'utf8')) as unknown; } catch { before = undefined; }
  store.audited({ actor: opts.actor, action: 'update', entity: opts.entity, entityId: opts.path, before, after: checked.value }, () => {
    const temp = `${opts.path}.tmp`;
    writeFileSync(temp, `${JSON.stringify(checked.value, null, 2)}\n`);
    renameSync(temp, opts.path);
  });
  return ok(checked.value);
}
