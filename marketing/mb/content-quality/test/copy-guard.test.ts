import { describe, expect, it } from 'vitest';
import { copyGuard, loadCopyRules, readingGrade, unsourcedFigures } from '../src/index.ts';
import { rules } from './fixtures.ts';

describe('copyGuard', () => {
  it('passes plain copy with a hyphen', () => {
    expect(copyGuard('A well-planned week of practice.', rules, { allowFactTokens: false })).toEqual([]);
  });

  it('is case-insensitive about promised results', () => {
    expect(copyGuard('We offer Best Coaching in Kerala', rules, { allowFactTokens: false }).map((f) => f.code)).toEqual(['banned-claim']);
  });

  it('allows fact placeholders in drafts but not in final text', () => {
    expect(copyGuard('Exam on {{fact:x}}', rules, { allowFactTokens: true })).toEqual([]);
    expect(copyGuard('Exam on {{fact:x}}', rules, { allowFactTokens: false }).map((f) => f.code)).toEqual(['unresolved-fact']);
  });
});

describe('unsourcedFigures', () => {
  it('finds money, percentages, years, dates, ranks and counts', () => {
    const found = unsourcedFigures('Fee Rs 4,000 or ₹2,000, 40% off, in 2027, on 17 January, AIR 12, 120 seats.');
    expect(found).toEqual(expect.arrayContaining(['Rs 4,000', '₹2,000', '40%', '2027', '17 January', 'AIR 12', '120 seats']));
  });

  it('ignores ordinary small numbers', () => {
    expect(unsourcedFigures('Follow these 8 steps and practise 3 times a week.')).toEqual([]);
  });
});

describe('readingGrade', () => {
  it('scores simple text low and dense text high', () => {
    expect(readingGrade('Draw a cat. Draw a dog. Use a pen. It is fun.')).toBeLessThan(3);
    expect(readingGrade('Institutional administrators necessitate comprehensive documentation regarding methodological considerations.')).toBeGreaterThan(15);
  });
});

describe('the real rules file', () => {
  it('loads and bans the promises we never make', () => {
    const r = loadCopyRules(new URL('../../../config/copy-rules.json', import.meta.url).pathname);
    expect(r.ok && r.value.bannedPhrases).toEqual(expect.arrayContaining(['guaranteed', '100% selection']));
  });
});

describe('never talk about fees', () => {
  it('blocks fee and price words, the rupee sign and fee placeholders, but not look-alike words', () => {
    const run = (t: string): string[] => copyGuard(t, rules, { allowFactTokens: true }).map((f) => f.code);
    expect(run('The fee is low')).toEqual(['fees-topic']);
    expect(run('Prices start soon')).toEqual(['fees-topic']);
    expect(run('Only ₹4,000')).toEqual(['fees-topic']);
    expect(run('Pay Rs 500')).toEqual(['fees-topic']);
    expect(run('Exam fee is {{fact:uceed-2027-fee-general}}')).toEqual(['fees-topic']);
    expect(run('{{fact:uceed-2027-fee-general}}')).toEqual(['fees-topic']);
    expect(run('Coffee, offers, feel free to ask, and a free demo class')).toEqual([]);
  });
});
