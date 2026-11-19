import type { Brief, CopyRules, Draft } from '../src/index.ts';

export const rules: CopyRules = {
  bannedPhrases: ['guaranteed', '100% selection', 'best coaching'],
  stockOpeners: ["in today's fast-paced world", 'welcome to'],
  bannedWords: ['fee', 'fees', 'price', 'prices', 'rs'],
  bannedSymbols: ['₹'],
};

export const brief: Brief = {
  primaryKeyword: 'NID DAT',
  secondaryKeywords: ['studio test'],
  searchIntent: 'informational',
  contentGoal: 'education',
  funnelStage: 'middle',
  audience: 'Class 12 students planning for NID',
  cta: { text: 'Book a free demo class' },
  readerAnswers: {
    who: 'A Class 12 student in Kerala',
    outcome: 'Knows how to plan the months before the exam',
    whyUs: 'Mentors who have trained NID aspirants for years',
    proof: 'Alumni who cleared the exam',
    nextStep: 'Book a free demo class',
  },
};

// A plain sentence block used to give the page enough length so keyword density stays low.
export const filler = (sentences: number): string =>
  Array.from({ length: sentences }, () => 'Practise every day with a timer and review each attempt with a mentor.').join(' ');

const answer = (lead: string): string =>
  `${lead} Start with simple drawing tasks, then add timed practice, and ask a mentor to review your work every week so you see what to fix next.`;

export const goodBody = [
  '# NID DAT preparation: a plan that works',
  `Many students ask where to begin with NID DAT. This page gives a clear plan that you can follow week by week. ${filler(2)}`,
  '## Key takeaways',
  '- Start early and practise often',
  '- Review every attempt',
  '## How do you prepare for NID DAT?',
  answer('Preparation for NID DAT works best when you build the habit first.'),
  '## What does the studio test check?',
  answer('The studio test checks how you observe, think and make something with your hands.'),
  '## A weekly routine',
  filler(6),
  filler(6),
  filler(6),
  filler(6),
  '## Next step',
  `${filler(2)} Book a free demo class and we will plan your first month with you.`,
].join('\n\n');

export const goodDraft: Draft = {
  seoTitle: 'NID DAT preparation: a simple weekly plan',
  metaDescription: 'A clear weekly plan for NID DAT preparation, with timed practice, mentor review and a free demo class to start.',
  slug: 'nid-dat-preparation',
  body: goodBody,
  brief,
};
