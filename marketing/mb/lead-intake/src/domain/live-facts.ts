import { z } from 'zod';

// The facts feed the website reads. Only confirmed facts are ever published; each is plain text a reader could see.
export const LiveFactsPayloadSchema = z.object({
  version: z.literal(1),
  publishedAt: z.iso.datetime({ offset: true }),
  facts: z.record(z.string(), z.object({ label: z.string(), value: z.string(), date: z.string().optional() })),
});
export type LiveFactsPayload = z.infer<typeof LiveFactsPayloadSchema>;

export interface LiveFactInput {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly date?: string | undefined;
  readonly usable: boolean;
}

// Unconfirmed facts (pending, secondary) never leave the app: a page must not show a date nobody has checked.
export function buildLivePayload(facts: readonly LiveFactInput[], now: Date): LiveFactsPayload {
  const out: LiveFactsPayload['facts'] = {};
  for (const f of facts) {
    if (!f.usable) continue;
    out[f.id] = f.date === undefined ? { label: f.label, value: f.value } : { label: f.label, value: f.value, date: f.date };
  }
  return { version: 1, publishedAt: now.toISOString(), facts: out };
}

// The tag to put around a figure on a page written by hand; the value inside is what shows until the feed answers.
export const liveFactTag = (id: string, value: string): string => `<span data-afd-fact="${id}">${value.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`)}</span>`;
