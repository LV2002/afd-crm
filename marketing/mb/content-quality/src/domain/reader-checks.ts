import type { Draft } from './brief.ts';
import { unsourcedFigures } from './figures.ts';
import { advisory, type Finding } from './finding.ts';
import { contains, countWords, parseBlocks, plainText } from './markdown.ts';
import { readingGrade } from './readability.ts';
import type { CopyRules } from './rules.ts';

const MAX_GRADE = 9;
const MAX_PARAGRAPH_WORDS = 70;
const MAX_INTRO_WORDS = 100;

// Advisory: these never stop publishing, they tell the owner what to look at.
export function readerChecks(d: Draft, rules: CopyRules): Finding[] {
  const out: Finding[] = [];
  const blocks = parseBlocks(d.body);
  const paragraphs = blocks.filter((b) => b.kind === 'paragraph');
  const text = plainText(d.body);

  const grade = readingGrade(text);
  if (grade > MAX_GRADE) out.push(advisory('reading-grade', `reads at about grade ${grade.toFixed(1)}; aim for ${String(MAX_GRADE)} or lower for students and parents`));
  const intro = paragraphs[0];
  if (intro !== undefined && countWords(plainText(intro.text)) > MAX_INTRO_WORDS) out.push(advisory('long-intro', `the introduction is over ${String(MAX_INTRO_WORDS)} words`));
  const long = paragraphs.filter((p) => countWords(plainText(p.text)) > MAX_PARAGRAPH_WORDS).length;
  if (long > 0) out.push(advisory('long-paragraphs', `${String(long)} paragraph(s) run over ${String(MAX_PARAGRAPH_WORDS)} words; split them`));
  const opener = intro === undefined ? undefined : rules.stockOpeners.find((o) => intro.text.toLowerCase().startsWith(o));
  if (opener !== undefined) out.push(advisory('stock-opener', `opens with the stock phrase "${opener}"; start with something specific`));

  const figures = unsourcedFigures(d.body.replace(/\{\{fact:[a-z0-9-]+\}\}/g, ''));
  if (figures.length > 0) out.push(advisory('unsourced-figures', `typed-out figures that should be fact placeholders or checked by the owner: ${figures.slice(0, 6).join(', ')}`));

  const ending = blocks.slice(-3).map((b) => b.text).join(' ');
  if (!contains(ending, d.brief.cta.text) && !/\]\(https?:/.test(ending)) out.push(advisory('final-next-step', `the ending does not point to the next step ("${d.brief.cta.text}")`));
  return out;
}
