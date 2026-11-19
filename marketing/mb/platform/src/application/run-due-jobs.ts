import type { Clock } from '../domain/clock.ts';
import { isDue, type JobDef, type JobRun } from '../domain/jobs.ts';
import type { Logger } from '../domain/logger.ts';

// Port: how job runs are remembered.
export interface JobRunStore {
  last(name: string): JobRun | undefined;
  start(name: string, at: Date): string;
  finish(runId: string, at: Date, status: 'ok' | 'failed', error?: string): void;
}

export async function runDueJobs(jobs: readonly JobDef[], store: JobRunStore, clock: Clock, log: Logger): Promise<void> {
  for (const job of jobs) {
    if (!isDue(job, store.last(job.name), clock.now())) continue;
    const runId = store.start(job.name, clock.now());
    try {
      const result = await job.run();
      store.finish(runId, clock.now(), result.ok ? 'ok' : 'failed', result.ok ? undefined : result.error);
      if (!result.ok) log.warn('job failed', { job: job.name, error: result.error });
    } catch (cause) {
      // A throw is a bug in the job; record it and keep the other jobs running.
      const message = cause instanceof Error ? cause.message : 'unknown error';
      store.finish(runId, clock.now(), 'failed', message);
      log.error('job crashed', { job: job.name, error: message });
    }
  }
}
