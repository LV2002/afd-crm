import { blocking, type Finding } from './finding.ts';
import type { CopyRules } from './rules.ts';

// The house rules for anything we publish (CLAUDE.md): no em or en dashes, no promised results or unprovable superlatives.
// allowFactTokens is true while a draft still carries {{fact:...}} tokens; false for final text, where a leftover token is a bug.
export function copyGuard(text: string, rules: CopyRules, options: { allowFactTokens: boolean }): Finding[] {
  const findings: Finding[] = [];
  const dashes = text.match(/[—–]/g)?.length ?? 0;
  if (dashes > 0) findings.push(blocking('dash', `${String(dashes)} em or en dash(es): use a comma, colon or full stop`));
  const lower = text.toLowerCase();
  for (const phrase of rules.bannedPhrases) {
    if (lower.includes(phrase.toLowerCase())) findings.push(blocking('banned-claim', `"${phrase}" promises a result or makes a claim we cannot prove`));
  }
  for (const word of rules.bannedWords) {
    if (new RegExp(`(?<![a-z0-9])${word}(?![a-z0-9])`, 'i').test(text)) findings.push(blocking('fees-topic', `"${word}": we never write about fees or prices`));
  }
  for (const symbol of rules.bannedSymbols) {
    if (text.includes(symbol)) findings.push(blocking('fees-topic', `"${symbol}": we never write about fees or prices`));
  }
  if (!options.allowFactTokens && /\{\{fact:/.test(text)) findings.push(blocking('unresolved-fact', 'a fact placeholder was left in the final text'));
  return findings;
}
