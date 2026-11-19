import { err, ok, type Result } from '@mb/platform';
import { isUsable, type Fact } from './fact.ts';

export type FactProblem =
  | { readonly kind: 'unknown'; readonly id: string }
  | { readonly kind: 'not-usable'; readonly id: string; readonly status: Fact['status'] };

const TOKEN = /\{\{fact:([a-z0-9-]+)\}\}/g;

// Generated text never contains a typed-out date or fee: it carries {{fact:<id>}} and the value is filled in here,
// so a number can only come from the facts table. Any problem stops the fill-in and is reported.
export function resolveFacts(text: string, facts: ReadonlyMap<string, Fact>): Result<string, FactProblem[]> {
  const problems: FactProblem[] = [];
  const resolved = text.replace(TOKEN, (whole, id: string) => {
    const fact = facts.get(id);
    if (fact === undefined) problems.push({ kind: 'unknown', id });
    else if (!isUsable(fact)) problems.push({ kind: 'not-usable', id, status: fact.status });
    else return fact.value;
    return whole;
  });
  return problems.length === 0 ? ok(resolved) : err(problems);
}

export const factIdsIn = (text: string): string[] => [...text.matchAll(TOKEN)].map((m) => m[1] ?? '');

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

// The same fill-in, for page bodies: each value is wrapped in <span data-afd-fact="id">, so the footer script can refresh it
// from the facts feed when the fact changes. The text inside is the value as of now, which is what search engines and
// readers without scripts see. Meta tags and page markup stay plain text (use resolveFacts), because the browser cannot change those.
export function resolveFactsLive(text: string, facts: ReadonlyMap<string, Fact>): Result<string, FactProblem[]> {
  const problems: FactProblem[] = [];
  const resolved = text.replace(TOKEN, (whole, id: string) => {
    const fact = facts.get(id);
    if (fact === undefined) problems.push({ kind: 'unknown', id });
    else if (!isUsable(fact)) problems.push({ kind: 'not-usable', id, status: fact.status });
    else return `<span data-afd-fact="${id}">${escapeHtml(fact.value)}</span>`;
    return whole;
  });
  return problems.length === 0 ? ok(resolved) : err(problems);
}
