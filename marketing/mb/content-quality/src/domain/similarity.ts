import { normalise } from './markdown.ts';

const SHINGLE = 5;

const shingles = (text: string): Set<string> => {
  const words = normalise(text.replace(/\{\{fact:[a-z0-9-]+\}\}/g, ' ')).split(' ').filter((w) => w !== '');
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= words.length; i++) out.add(words.slice(i, i + SHINGLE).join(' '));
  return out;
};

// Share of five-word runs two texts have in common (0 to 1). Pages that only swap a place name share most of them.
export function similarity(a: string, b: string): number {
  const x = shingles(a);
  const y = shingles(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const s of x) if (y.has(s)) shared++;
  return shared / (x.size + y.size - shared);
}
