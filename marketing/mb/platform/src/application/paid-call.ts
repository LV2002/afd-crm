import { istMonthRange } from '../domain/budget.ts';
import type { Clock } from '../domain/clock.ts';
import { err, ok, type Result } from '../domain/result.ts';

// Port: where paid calls are remembered.
export interface PaidCallStore {
  findFresh(provider: string, requestKey: string, notBefore: Date): string | undefined;
  record(entry: { provider: string; operation: string; requestKey: string; costMicroUsd: number; payload: string; at: Date }): void;
  totalMicroUsd(from: Date, to: Date): number;
}

export interface PaidCallRequest {
  readonly provider: string;
  readonly operation: string;
  // Same inputs give the same key, so a repeat within maxAgeDays reuses the saved answer and costs nothing.
  readonly requestKey: string;
  readonly estimateMicroUsd: number;
  readonly maxAgeDays: number;
}

export type PaidCallError =
  | { readonly kind: 'over-cap'; readonly spentMicroUsd: number; readonly capMicroUsd: number }
  | { readonly kind: 'failed'; readonly message: string };

export interface PaidCallResult {
  readonly payload: unknown;
  readonly cached: boolean;
}

const MS_PER_DAY = 86_400_000;

// Every paid call goes through here: reuse a fresh saved answer, refuse when the month's cap would be passed,
// otherwise call, then log the real cost and keep the raw payload as evidence.
export async function runPaidCall(
  deps: { store: PaidCallStore; clock: Clock; capMicroUsd: number },
  req: PaidCallRequest,
  exec: () => Promise<Result<{ payload: unknown; costMicroUsd: number }, string>>,
): Promise<Result<PaidCallResult, PaidCallError>> {
  const now = deps.clock.now();
  const saved = deps.store.findFresh(req.provider, req.requestKey, new Date(now.getTime() - req.maxAgeDays * MS_PER_DAY));
  if (saved !== undefined) return ok({ payload: JSON.parse(saved) as unknown, cached: true });

  const month = istMonthRange(now);
  const spent = deps.store.totalMicroUsd(month.start, month.end);
  if (spent + req.estimateMicroUsd > deps.capMicroUsd) return err({ kind: 'over-cap', spentMicroUsd: spent, capMicroUsd: deps.capMicroUsd });

  const done = await exec();
  if (!done.ok) return err({ kind: 'failed', message: done.error });
  deps.store.record({
    provider: req.provider, operation: req.operation, requestKey: req.requestKey,
    costMicroUsd: done.value.costMicroUsd, payload: JSON.stringify(done.value.payload), at: deps.clock.now(),
  });
  return ok({ payload: done.value.payload, cached: false });
}
