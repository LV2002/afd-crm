import type { Draft } from './brief.ts';
import { blocking, type Finding } from './finding.ts';
import { countWords, parseBlocks, plainText } from './markdown.ts';

const ANSWER_MIN = 30;
const ANSWER_MAX = 80;
const QUESTION_START = /^(how|what|why|when|where|which|who|is|are|can|should|does|do|will)\b/i;
const TAKEAWAYS = /key takeaways|quick answer|in short|at a glance/i;
const EARLY_SHARE = 0.3;

// Written so a search engine or an AI assistant can lift a direct answer out of the page.
export function searchChecks(d: Draft): Finding[] {
  const out: Finding[] = [];
  const blocks = parseBlocks(d.body);
  const answered = blocks.filter((b, i) => {
    if (b.kind !== 'heading' || b.level !== 2 || !(b.text.trim().endsWith('?') || QUESTION_START.test(b.text.trim()))) return false;
    const next = blocks[i + 1];
    if (next?.kind !== 'paragraph') return false;
    const words = countWords(plainText(next.text));
    return words >= ANSWER_MIN && words <= ANSWER_MAX;
  });
  if (answered.length < 2) out.push(blocking('question-answers', `need at least 2 question headings (H2) each followed by a direct answer of ${String(ANSWER_MIN)} to ${String(ANSWER_MAX)} words; found ${String(answered.length)}`));
  const early = blocks.slice(0, Math.max(3, Math.ceil(blocks.length * EARLY_SHARE)));
  if (!early.some((b) => b.kind === 'heading' && TAKEAWAYS.test(b.text))) out.push(blocking('key-takeaways', 'add a "Key takeaways" or "Quick answer" section near the top'));
  return out;
}
