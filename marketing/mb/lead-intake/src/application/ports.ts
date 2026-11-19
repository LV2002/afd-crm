import type { Result } from '@mb/platform';
import type { LiveFactsPayload } from '../domain/live-facts.ts';
import type { PopupsPayload } from '../domain/popup.ts';

// Port: sends the current facts to the website's feed. The real one posts, signed, to the Apps Script; tests use a fake.
export interface FactsPublisher {
  publish(payload: LiveFactsPayload): Promise<Result<{ readonly count: number }, string>>;
}

// Port: sends the pop-ups that are on to the website's feed.
export interface PopupsPublisher {
  publish(payload: PopupsPayload): Promise<Result<{ readonly count: number }, string>>;
}
