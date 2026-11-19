import { readFileSync } from 'node:fs';
import type { ZodType } from 'zod';
import { parseConfig, type ConfigError } from '../domain/config.ts';
import { err, type Result } from '../domain/result.ts';

export function loadJsonConfig<T>(path: string, schema: ZodType<T>): Result<T, ConfigError> {
  try {
    return parseConfig(schema, JSON.parse(readFileSync(path, 'utf8')), path);
  } catch (cause) {
    return err({ source: path, issues: [cause instanceof Error ? cause.message : 'unreadable'] });
  }
}
