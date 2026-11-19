import { describe, expect, it } from 'vitest';
import { contentCheck, hashDraft, isReady, type Draft } from '../src/index.ts';
import { brief, filler, goodBody, goodDraft, rules } from './fixtures.ts';

const codes = (d: Draft, kind: 'blocking' | 'advisory' = 'blocking'): string[] => contentCheck(d, rules)[kind].map((f) => f.code);
const withBody = (body: string): Draft => ({ ...goodDraft, body });

describe('a good draft', () => {
  it('passes every blocking check', () => {
    const r = contentCheck(goodDraft, rules);
    expect(r.blocking).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe('blocking: SEO', () => {
  it('rejects a long title and a long meta description', () => {
    expect(codes({ ...goodDraft, seoTitle: `NID DAT ${'x'.repeat(60)}` })).toContain('title-length');
    expect(codes({ ...goodDraft, metaDescription: `NID DAT ${'x'.repeat(160)}` })).toContain('meta-length');
  });

  it('wants the main keyword in the title, H1, intro, an H2, meta description and slug', () => {
    expect(codes({ ...goodDraft, seoTitle: 'A simple weekly plan' })).toContain('keyword-placement');
    expect(codes({ ...goodDraft, slug: 'weekly-plan' })).toContain('keyword-placement');
    expect(codes({ ...goodDraft, metaDescription: 'A clear weekly plan with timed practice, mentor review and a free demo class to start the work today.' })).toContain('keyword-placement');
  });

  it('wants exactly one H1', () => {
    expect(codes(withBody(`${goodBody}\n\n# Another top heading`))).toContain('one-h1');
    expect(codes(withBody(goodBody.replace('# NID DAT preparation: a plan that works', 'NID DAT preparation')))).toContain('one-h1');
  });

  it('rejects stuffing and a keyword used fewer than 3 times', () => {
    expect(codes(withBody(`${goodBody}\n\n${'NID DAT '.repeat(40)}`))).toContain('keyword-density');
    expect(codes({ ...goodDraft, body: '# NID DAT\n\nShort page.' })).toContain('keyword-count');
  });
});

describe('blocking: written for search and AI answers', () => {
  it('needs two question headings with a direct 30 to 80 word answer', () => {
    const noQuestions = goodBody.replace('How do you prepare for NID DAT?', 'Preparation').replace('What does the studio test check?', 'The studio test');
    expect(codes(withBody(noQuestions))).toContain('question-answers');
    const shortAnswer = goodBody.replace(/Preparation for NID DAT works best[^\n]*/, 'Practise often.');
    expect(codes(withBody(shortAnswer))).toContain('question-answers');
  });

  it('needs a key takeaways section near the top', () => {
    expect(codes(withBody(goodBody.replace('## Key takeaways', '## Some points')))).toContain('key-takeaways');
  });
});

describe('blocking: house rules and brief', () => {
  it('rejects em dashes and promised results, including in the title and meta description', () => {
    expect(codes(withBody(`${goodBody}\n\nYou will crack it — guaranteed.`))).toEqual(expect.arrayContaining(['dash', 'banned-claim']));
    expect(codes({ ...goodDraft, seoTitle: 'NID DAT plan – 100% selection' })).toEqual(expect.arrayContaining(['dash', 'banned-claim']));
  });

  it('rejects an incomplete brief', () => {
    const thin = { ...brief, readerAnswers: { ...brief.readerAnswers, proof: '' } };
    expect(codes({ ...goodDraft, brief: thin })).toContain('brief');
  });
});

describe('advisory: reader checks', () => {
  it('flags figures typed in instead of fact placeholders, and accepts placeholders', () => {
    const typed = contentCheck(withBody(`${goodBody}\n\nThe exam is on 20 December 2026 and last year the top rank was AIR 12.`), rules);
    expect(typed.ok).toBe(true);
    expect(typed.advisory.map((f) => f.code)).toContain('unsourced-figures');
    const tokens = codes(withBody(`${goodBody}\n\nThe exam is on {{fact:nid-2027-dat-prelims-date}}.`), 'advisory');
    expect(tokens).not.toContain('unsourced-figures');
  });

  it('flags stock openers, long paragraphs, a missing next step and hard reading', () => {
    const opener = goodBody.replace('Many students ask', "In today's fast-paced world, many students ask");
    expect(codes(withBody(opener), 'advisory')).toContain('stock-opener');
    expect(codes(withBody(`${goodBody}\n\n${filler(8)}`), 'advisory')).toContain('long-paragraphs');
    expect(codes(withBody(goodBody.replace('Book a free demo class', 'Talk to us')), 'advisory')).toContain('final-next-step');
    const hard = 'Notwithstanding considerable infrastructural complications, institutional administrators necessitate comprehensive documentation regarding extraordinarily sophisticated methodological considerations.';
    expect(codes(withBody(`${goodBody}\n\n${hard} ${hard} ${hard} ${hard}`), 'advisory')).toContain('reading-grade');
  });
});

describe('ready only while the checked text is unchanged', () => {
  it('is ready right after a passing check', () => {
    expect(isReady(contentCheck(goodDraft, rules), goodDraft)).toBe(true);
  });

  it('is no longer ready after any edit, even a single character', () => {
    const checked = contentCheck(goodDraft, rules);
    expect(isReady(checked, { ...goodDraft, body: `${goodBody}.` })).toBe(false);
    expect(isReady(checked, { ...goodDraft, slug: 'nid-dat-preparation-2' })).toBe(false);
    expect(hashDraft(goodDraft)).toBe(hashDraft({ ...goodDraft }));
  });

  it('is never ready when a blocking check failed', () => {
    const bad = withBody(`${goodBody}\n\nguaranteed`);
    expect(isReady(contentCheck(bad, rules), bad)).toBe(false);
  });
});
