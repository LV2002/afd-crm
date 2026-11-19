export type TaskStatus = 'queued' | 'running' | 'done' | 'failed';

export interface TaskRow {
  readonly id: string;
  readonly kind: string;
  readonly input: unknown;
  readonly status: TaskStatus;
  readonly progressPct: number;
  readonly progressNote: string;
  readonly result: unknown;
  readonly error: string | undefined;
  readonly attempts: number;
  readonly notBefore: Date | undefined;
  readonly createdAt: Date;
  readonly finishedAt: Date | undefined;
}

// A handler says why it failed and, when the cause is temporary (the writer's plan limit), when to try again.
export interface TaskFailure {
  readonly message: string;
  readonly retryAt?: Date;
}
