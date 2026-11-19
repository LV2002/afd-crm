import { createHmac } from 'node:crypto';
import { err, ok, redact, type Clock, type Result } from '@mb/platform';
import type { FactsPublisher } from '../application/ports.ts';
import type { LiveFactsPayload } from '../domain/live-facts.ts';

export interface AppsScriptFactsOptions {
  readonly endpoint: string;
  readonly secret: string;
  readonly fetch: typeof fetch;
  readonly clock: Clock;
}

// Apps Script cannot read request headers, so the signature travels in the body: HMAC-SHA256 of "<timestamp>.<payload text>"
// with a key only this Mac and the script know. The script refuses anything unsigned or older than ten minutes.
export const signPublish = (secret: string, timestamp: number, payloadJson: string): string => createHmac('sha256', secret).update(`${String(timestamp)}.${payloadJson}`).digest('hex');

export class AppsScriptFactsPublisher implements FactsPublisher {
  private readonly o: AppsScriptFactsOptions;

  constructor(options: AppsScriptFactsOptions) {
    this.o = options;
  }

  async publish(payload: LiveFactsPayload): Promise<Result<{ count: number }, string>> {
    if (this.o.endpoint === '') return err('The lead script address is not set, so there is nowhere to publish to.');
    if (this.o.secret === '') return err('FACTS_PUBLISH_SECRET is not set in .env.');
    const timestamp = this.o.clock.now().getTime();
    const payloadJson = JSON.stringify(payload);
    const body = JSON.stringify({ _afd_publish: 'facts', timestamp, payloadJson, signature: signPublish(this.o.secret, timestamp, payloadJson) });
    try {
      const res = await this.o.fetch(this.o.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'follow' });
      const answer = (await res.json()) as { ok?: boolean; error?: string; count?: number };
      if (answer.ok === true) return ok({ count: answer.count ?? Object.keys(payload.facts).length });
      return err(redact(answer.error ?? `The website feed refused it (status ${String(res.status)}).`, [this.o.secret]));
    } catch (cause) {
      return err(redact(cause instanceof Error ? cause.message : 'The website feed could not be reached.', [this.o.secret]));
    }
  }
}
