import type { Result } from './result.ts';

export interface JobDef {
  readonly name: string;
  readonly everyMinutes: number;
  // A run still marked running after this long is treated as crashed, so a dead process cannot block the job forever.
  readonly timeoutMinutes: number;
  run(): Promise<Result<void, string>>;
}

export interface JobRun {
  readonly startedAt: Date;
  readonly status: 'running' | 'ok' | 'failed';
}

const MS_PER_MINUTE = 60_000;

// A missed window runs once when the Mac is next awake; there is no catch-up burst.
export function isDue(job: JobDef, last: JobRun | undefined, now: Date): boolean {
  if (last === undefined) return true;
  const ageMinutes = (now.getTime() - last.startedAt.getTime()) / MS_PER_MINUTE;
  if (last.status === 'running') return ageMinutes >= job.timeoutMinutes;
  return ageMinutes >= job.everyMinutes;
}
