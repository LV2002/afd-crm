import { describe, expect, it } from 'vitest';
import { examOf, hasPageFor, intentOf, isMoneyTopic, INTENTS, pageFor } from '../src/index.ts';

describe('examOf', () => {
  it('names the exam a text is about, and nothing when none is named', () => {
    expect(examOf('NIFT syllabus 2027')).toBe('NIFT');
    expect(examOf('how to prepare for uceed')).toBe('UCEED');
    expect(examOf('ceed exam date')).toBe('CEED');
    expect(examOf('/blog/post/nid-dat-preparation')).toBe('NID');
    expect(examOf('best colours for a drawing')).toBeUndefined();
  });
  it('does not mistake UCEED for CEED', () => { expect(examOf('uceed eligibility')).toBe('UCEED'); });
});

describe('intentOf', () => {
  it('tells what kind of question a search is', () => {
    expect(intentOf('nift exam pattern')?.id).toBe('syllabus');
    expect(intentOf('nid dat last date to apply')?.id).toBe('dates');
    expect(intentOf('nata previous year question papers')?.id).toBe('papers');
    expect(intentOf('how to crack uceed')?.id).toBe('preparation');
    expect(intentOf('flowers')).toBeUndefined();
  });
  it('has an address pattern for every intent, so an existing page can be recognised', () => {
    for (const i of INTENTS) expect(i.inPath).toBeInstanceOf(RegExp);
  });
});

describe('money topics and existing pages', () => {
  it('spots a search about fees, which we never write about', () => {
    expect(isMoneyTopic('nift coaching fees')).toBe(true);
    expect(isMoneyTopic('coffee shop')).toBe(false);
  });
  it('recognises a page for the exam and the kind of question from its address', () => {
    const syllabus = INTENTS.find((i) => i.id === 'syllabus');
    if (syllabus === undefined) throw new Error('missing intent');
    expect(hasPageFor(['/blog/post/nift-syllabus-and-pattern'], 'NIFT', syllabus)).toBe(true);
    expect(hasPageFor(['/blog/post/nid-syllabus'], 'NIFT', syllabus)).toBe(false);
  });
});

describe('pageFor: a page that already answers a keyword', () => {
  const pages = [
    { path: '/page/nift-coaching-ernakulam', text: 'nift coaching ernakulam NIFT Coaching in Ernakulam | afdindia' },
    { path: '/page/nift-nid-uceed-coaching-thrissur', text: 'nift nid uceed coaching thrissur' },
    { path: '/page/nid-coaching-cochin', text: 'nid coaching cochin' },
  ];
  it('finds the page whatever small words or spelling differ ("coaching Ernakulam" and "coaching in Ernakulam")', () => {
    expect(pageFor('NIFT coaching in Ernakulam', pages)).toBe('/page/nift-coaching-ernakulam');
    expect(pageFor('NIFT coaching Ernakulam', pages)).toBe('/page/nift-coaching-ernakulam');
  });
  it('knows a place under its other names', () => {
    expect(pageFor('NID coaching in Kochi', pages)).toBe('/page/nid-coaching-cochin');
    expect(pageFor('NID coaching in Ernakulam', pages)).toBe('/page/nid-coaching-cochin');
  });
  it('finds a page that covers several exams, for any one of them', () => {
    expect(pageFor('UCEED coaching in Thrissur', pages)).toBe('/page/nift-nid-uceed-coaching-thrissur');
    expect(pageFor('NIFT coaching in Trichur', pages)).toBe('/page/nift-nid-uceed-coaching-thrissur');
  });
  it('does not call a different place or exam a match, and finds nothing for an empty keyword', () => {
    expect(pageFor('NIFT coaching in Wayanad', pages)).toBeUndefined();
    expect(pageFor('CEED coaching in Ernakulam', pages)).toBeUndefined();
    expect(pageFor('the in of', pages)).toBeUndefined();
  });
});
