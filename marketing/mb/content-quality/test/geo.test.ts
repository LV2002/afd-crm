import { describe, expect, it } from 'vitest';
import { contentCheck, similarity, type Draft, type GeoBrief } from '../src/index.ts';
import { goodDraft, rules } from './fixtures.ts';

const geo = (over: Partial<GeoBrief> = {}): GeoBrief => ({
  key: 'nid:idukki', titleHint: 'NID Coaching in Idukki: Where to Prepare', tier: 'district', place: 'Idukki', path: '/page/nid-coaching-in-idukki', angle: 'which official centres are near Idukki', neighbours: ['Ernakulam', 'Kottayam'],
  centres: [{ name: 'Kochi', district: 'Ernakulam', relation: 'next-door' }, { name: 'Kannur', district: 'Kannur', relation: 'further' }], links: [], examCentreFactId: 'nid-2027-dat-centre-kerala', noNearbyCentre: false, ...over,
});
const local = (g: GeoBrief = geo(), body = goodDraft.body): Draft => ({ ...goodDraft, body, brief: { ...goodDraft.brief, geo: g } });
const codes = (d: Draft, siblings: { label: string; body: string }[] = []): string[] => contentCheck(d, rules, siblings).blocking.map((f) => f.code);
const advisories = (d: Draft): string[] => contentCheck(d, rules).advisory.map((f) => f.code);

describe('similarity', () => {
  it('is 1 for the same text, 0 for unrelated text, and high when only a place name changes', () => {
    const a = 'Students in Ernakulam can sit the exam at the official centre and then plan their weekly drawing practice with a mentor every single week.';
    expect(similarity(a, a)).toBe(1);
    expect(similarity(a, 'Completely different words about cooking pasta in a hot kitchen with garlic and olive oil and plenty of basil leaves.')).toBe(0);
    expect(similarity(a, a.replace('Ernakulam', 'Idukki'))).toBeGreaterThan(0.5);
  });
  it('ignores fact placeholders and markdown, and is 0 for text too short to compare', () => {
    expect(similarity('short text', 'short text')).toBe(0);
    expect(similarity('# A heading\n\nOne two three four five six seven {{fact:a-b}} eight', 'A heading One two three four five six seven eight')).toBeGreaterThan(0.5);
  });
});

describe('local page checks', () => {
  it('does nothing for a page that is not local', () => {
    expect(codes(goodDraft, [{ label: 'x', body: goodDraft.body }])).toEqual([]);
  });

  it('requires the official exam-centre list on a local page', () => {
    expect(codes(local())).toContain('geo-centres');
    expect(codes(local(geo(), `${goodDraft.body}\n\nThe exam is held at the centres listed: {{fact:nid-2027-dat-centre-kerala}}.`))).not.toContain('geo-centres');
    expect(codes(local(geo({ examCentreFactId: undefined })))).not.toContain('geo-centres');
  });

  it('requires every local page to say we also teach online', () => {
    const body = `${goodDraft.body}\n\n{{fact:nid-2027-dat-centre-kerala}}`;
    expect(codes(local(geo({ onlineFactId: 'afd-online-coaching' }), body))).toContain('geo-online');
    expect(codes(local(geo({ onlineFactId: 'afd-online-coaching' }), `${body}\n\nOnline: {{fact:afd-online-coaching}}`))).not.toContain('geo-online');
    expect(codes(local(geo(), body))).not.toContain('geo-online');
  });

  it('blocks a page that reads like a sibling page, naming the sibling and what it must add', () => {
    const body = `${goodDraft.body}\n\n{{fact:nid-2027-dat-centre-kerala}}`;
    const found = contentCheck(local(geo(), body), rules, [{ label: 'NID coaching in Wayanad', body }]).blocking.find((f) => f.code === 'geo-duplicate');
    expect(found?.message).toContain('NID coaching in Wayanad');
    expect(found?.message).toContain('which official centres are near Idukki');
    expect(codes(local(geo(), body), [{ label: 'other', body: 'Nothing in common with this page at all, it talks about gardening and tools for the garden shed, watering cans and seed trays.' }])).not.toContain('geo-duplicate');
  });

  it('suggests naming the centre in the district, and never asks for bordering districts', () => {
    const adv = advisories(local(geo(), `${goodDraft.body}\n\n{{fact:nid-2027-dat-centre-kerala}}`));
    expect(adv).toContain('geo-our-centre');
    const named = `${goodDraft.body}\n\n{{fact:nid-2027-dat-centre-kerala}} Our Kochi centre is in Ernakulam, which borders Idukki.`;
    expect(advisories(local(geo(), named))).not.toContain('geo-our-centre');
    expect(adv).not.toContain('geo-neighbours');
  });

  it('needs both centres named, and the online programme, on a page for a district with no centre', () => {
    const far = geo({ place: 'Idukki', noNearbyCentre: true, onlineFactId: 'afd-online-coaching' });
    const body = `${goodDraft.body}\n\n{{fact:nid-2027-dat-centre-kerala}} {{fact:afd-online-coaching}} Come to Kochi for classes.`;
    expect(codes(local(far, body))).toContain('geo-both-options');
    expect(codes(local(far, `${body} Or Kannur.`))).not.toContain('geo-both-options');
  });

  it('changes the draft hash when the local brief changes, so an old pass cannot cover a new brief', () => {
    expect(contentCheck(local(geo()), rules).textHash).not.toBe(contentCheck(local(geo({ place: 'Wayanad' })), rules).textHash);
  });
});
