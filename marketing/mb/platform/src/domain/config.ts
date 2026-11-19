import type { ZodType } from 'zod';
import { err, ok, type Result } from './result.ts';

export interface ConfigError {
  readonly source: string;
  readonly issues: readonly string[];
}

// Config is data validated at the boundary; the type comes from the schema, never written twice (rule 5).
export function parseConfig<T>(schema: ZodType<T>, raw: unknown, source: string): Result<T, ConfigError> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  return err({ source, issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) });
}
