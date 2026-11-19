import type { Draft } from './brief.ts';
import { blocking, type Finding } from './finding.ts';
import { SIBLING_LIMIT, type Sibling } from './geo-checks.ts';
import { contains } from './markdown.ts';
import { similarity } from './similarity.ts';

// A comparison says who each exam suits. It never crowns one: that is an opinion we cannot source, and a student may take the wrong one.
const VERDICT = /\b(?:is|are|was|will be)\s+(?:much |far |a lot |way )?(?:better|easier|harder|tougher|superior|worse)\s+than\b|\bthe (?:better|easier|harder|best) (?:exam|choice|option)\b/i;

export function planChecks(d: Draft, siblings: readonly Sibling[]): Finding[] {
  const plan = d.brief.plan;
  if (plan === undefined) return [];
  const out: Finding[] = [];
  const missing = [...plan.requiredFactIds, ...(plan.onlineFactId === undefined ? [] : [plan.onlineFactId])].filter((id) => !d.body.includes(`{{fact:${id}}}`));
  if (missing.length > 0) out.push(blocking('plan-facts', `this page must stand on the official facts: add ${missing.map((id) => `{{fact:${id}}}`).join(', ')} where they belong`));
  const unnamed = plan.exams.filter((e) => !contains(d.body, e));
  if (unnamed.length > 0) out.push(blocking('plan-exams', `name ${unnamed.join(' and ')} in the text`));
  if (plan.kind === 'comparison' && VERDICT.test(d.body)) out.push(blocking('plan-verdict', 'do not say one exam is better, easier or harder than the other: say who each one suits and how to choose'));
  for (const s of siblings) {
    const alike = similarity(d.body, s.body);
    if (alike >= SIBLING_LIMIT) out.push(blocking('plan-duplicate', `${String(Math.round(alike * 100))} percent of this page reads like "${s.label}". It must say something that page does not: ${plan.angle}`));
  }
  return out;
}
