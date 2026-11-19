import type { Draft } from './brief.ts';
import { advisory, blocking, type Finding } from './finding.ts';
import { contains, countWords, normalise, occurrences, parseBlocks, plainText } from './markdown.ts';

const TITLE_MAX = 60;
const META_MAX = 160;
const META_MIN = 70;
const INTRO_WORDS = 100;
const DENSITY_MAX = 2.5;

export function seoChecks(d: Draft): Finding[] {
  const out: Finding[] = [];
  const kw = d.brief.primaryKeyword;
  const blocks = parseBlocks(d.body);
  const h1s = blocks.filter((b) => b.kind === 'heading' && b.level === 1);
  const h2s = blocks.filter((b) => b.kind === 'heading' && b.level === 2);
  const intro = plainText(blocks.filter((b) => b.kind === 'paragraph').map((b) => b.text).join(' ')).split(/\s+/).slice(0, INTRO_WORDS).join(' ');

  if (d.seoTitle.length > TITLE_MAX) out.push(blocking('title-length', `title is ${String(d.seoTitle.length)} characters; keep it to ${String(TITLE_MAX)} or search results cut it off`));
  if (d.metaDescription.length > META_MAX) out.push(blocking('meta-length', `meta description is ${String(d.metaDescription.length)} characters; keep it to ${String(META_MAX)}`));
  else if (d.metaDescription.length < META_MIN) out.push(advisory('meta-short', `meta description is only ${String(d.metaDescription.length)} characters`));
  if (h1s.length !== 1) out.push(blocking('one-h1', `the page needs exactly one H1, found ${String(h1s.length)}`));

  const placements: [string, boolean][] = [
    ['title', contains(d.seoTitle, kw)],
    ['H1', h1s.some((h) => contains(h.text, kw))],
    ['first 100 words', contains(intro, kw)],
    ['an H2 heading', h2s.some((h) => contains(h.text, kw))],
    ['meta description', contains(d.metaDescription, kw)],
    ['address (slug)', contains(d.slug, kw)],
  ];
  for (const [where, present] of placements) if (!present) out.push(blocking('keyword-placement', `the main keyword "${kw}" is missing from the ${where}`));

  const text = plainText(d.body);
  const total = countWords(text);
  const count = occurrences(text, kw);
  const density = total === 0 ? 0 : (count * countWords(normalise(kw))) / total * 100;
  if (count < 3) out.push(blocking('keyword-count', `the main keyword appears ${String(count)} time(s); use it at least 3 times`));
  if (density > DENSITY_MAX) out.push(blocking('keyword-density', `keyword density is ${density.toFixed(1)}%; keep it at or under ${String(DENSITY_MAX)}%`));
  else if (density > 1.5) out.push(advisory('keyword-density-high', `keyword density is ${density.toFixed(1)}%; 0.5 to 1.5% reads more naturally`));
  return out;
}
