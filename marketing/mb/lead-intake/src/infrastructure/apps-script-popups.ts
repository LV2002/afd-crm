import { err, ok, redact, type Clock, type Result } from '@mb/platform';
import type { PopupsPublisher } from '../application/ports.ts';
import type { PopupsPayload } from '../domain/popup.ts';
import { signPublish } from './apps-script-facts.ts';

export interface AppsScriptPopupsOptions { readonly endpoint: string; readonly secret: string; readonly fetch: typeof fetch; readonly clock: Clock }

// Signed exactly like the facts feed (same key, same ten-minute window), so only this Mac can change what the website shows.
export class AppsScriptPopupsPublisher implements PopupsPublisher {
  private readonly o: AppsScriptPopupsOptions;

  constructor(options: AppsScriptPopupsOptions) {
    this.o = options;
  }

  async publish(payload: PopupsPayload): Promise<Result<{ count: number }, string>> {
    if (this.o.endpoint === '') return err('The lead script address is not set, so there is nowhere to publish to.');
    if (this.o.secret === '') return err('FACTS_PUBLISH_SECRET is not set in .env.');
    const timestamp = this.o.clock.now().getTime();
    const payloadJson = JSON.stringify(payload);
    const body = JSON.stringify({ _afd_publish: 'popups', timestamp, payloadJson, signature: signPublish(this.o.secret, timestamp, payloadJson) });
    try {
      const res = await this.o.fetch(this.o.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'follow' });
      const answer = (await res.json()) as { ok?: boolean; error?: string; count?: number };
      if (answer.ok === true) return ok({ count: answer.count ?? payload.popups.length });
      return err(redact(answer.error ?? `The website feed refused it (status ${String(res.status)}).`, [this.o.secret]));
    } catch (cause) {
      return err(redact(cause instanceof Error ? cause.message : 'The website feed could not be reached.', [this.o.secret]));
    }
  }
}
