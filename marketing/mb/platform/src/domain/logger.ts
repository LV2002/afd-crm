import type { Clock } from './clock.ts';
import { redact } from './redact.ts';

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  readonly clock: Clock;
  readonly write: (line: string) => void;
  readonly secrets: readonly string[];
}

export function createLogger({ clock, write, secrets }: LoggerOptions): Logger {
  const emit = (level: string, message: string, fields: Record<string, unknown> = {}): void => {
    const line = JSON.stringify({ at: clock.now().toISOString(), level, message, ...fields });
    write(redact(line, secrets));
  };
  return {
    info: (m, f) => { emit('info', m, f); },
    warn: (m, f) => { emit('warn', m, f); },
    error: (m, f) => { emit('error', m, f); },
  };
}
