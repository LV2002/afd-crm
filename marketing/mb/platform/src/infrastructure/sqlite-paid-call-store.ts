import type { PaidCallStore } from '../application/paid-call.ts';
import type { Db } from './db.ts';

export class SqlitePaidCallStore implements PaidCallStore {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  findFresh(provider: string, requestKey: string, notBefore: Date): string | undefined {
    const row = this.db
      .prepare('SELECT payload FROM paid_call WHERE provider = ? AND request_key = ? AND at >= ? ORDER BY at DESC LIMIT 1')
      .get(provider, requestKey, notBefore.toISOString());
    return row === undefined ? undefined : String(row['payload']);
  }

  record(e: { provider: string; operation: string; requestKey: string; costMicroUsd: number; payload: string; at: Date }): void {
    this.db
      .prepare('INSERT INTO paid_call (id, at, provider, operation, request_key, cost_micro_usd, payload) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), e.at.toISOString(), e.provider, e.operation, e.requestKey, e.costMicroUsd, e.payload);
  }

  totalMicroUsd(from: Date, to: Date): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(cost_micro_usd), 0) AS total FROM paid_call WHERE at >= ? AND at < ?').get(from.toISOString(), to.toISOString());
    return Number(row?.['total'] ?? 0);
  }

  // What was spent in a period, by provider, for the budget screen.
  totalsByProvider(from: Date, to: Date): { provider: string; costMicroUsd: number; calls: number }[] {
    return this.db
      .prepare('SELECT provider, SUM(cost_micro_usd) AS cost, COUNT(*) AS calls FROM paid_call WHERE at >= ? AND at < ? GROUP BY provider ORDER BY cost DESC')
      .all(from.toISOString(), to.toISOString())
      .map((r) => ({ provider: String(r['provider']), costMicroUsd: Number(r['cost']), calls: Number(r['calls']) }));
  }
}
