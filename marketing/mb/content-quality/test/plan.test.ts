import { describe, expect, it } from 'vitest';
import { contentCheck, type Draft, type PlanBrief } from '../src/index.ts';
import { goodDraft, rules } from './fixtures.ts';

const plan = (over: Partial<PlanBrief> = {}): PlanBrief => ({
  key: 'compare:nid-vs-nift', kind: 'comparison', titleHint: 'NID vs NIFT', path: '/page/nid-vs-nift', angle: 'who each exam suits', exams: ['NID', 'NIFT'],
  requiredFactIds: ['nid-2027-dat-prelims-date', 'nift-2027-exam-date'], optionalFactIds: [], links: [], ...over,
});
const withPlan = (p: PlanBrief, body: string): Draft => ({ ...goodDraft, body, brief: { ...goodDraft.brief, plan: p } });
const FULL = `${goodDraft.body}\n\nNID Prelims {{fact:nid-2027-dat-prelims-date}} and NIFT {{fact:nift-2027-exam-date}}.`;
const codes = (d: Draft, siblings: { label: string; body: string }[] = []): string[] => contentCheck(d, rules, siblings).blocking.map((f) => f.code);

describe('planned page checks', () => {
  it('blocks a page that leaves out a fact it must stand on', () => {
    const found = contentCheck(withPlan(plan(), `${goodDraft.body}\n\nNID and NIFT compared.`), rules).blocking.find((f) => f.code === 'plan-facts');
    expect(found?.message).toContain('{{fact:nid-2027-dat-prelims-date}}');
    expect(found?.message).toContain('{{fact:nift-2027-exam-date}}');
  });
  it('passes a page that uses them and names both exams', () => {
    expect(codes(withPlan(plan(), FULL))).not.toEqual(expect.arrayContaining(['plan-facts', 'plan-exams']));
  });
  it('blocks a comparison that does not name an exam', () => {
    const found = contentCheck(withPlan(plan({ exams: ['NID', 'Zzyzx'] }), FULL), rules).blocking.find((f) => f.code === 'plan-exams');
    expect(found?.message).toContain('Zzyzx');
  });
  it('blocks a verdict that one exam is better or easier than the other, but not the plain question', () => {
    expect(codes(withPlan(plan(), `${FULL} NID is easier than NIFT for most students.`))).toContain('plan-verdict');
    expect(codes(withPlan(plan(), `${FULL} NIFT is better than NID.`))).toContain('plan-verdict');
    expect(codes(withPlan(plan(), `${FULL}\n\n## Which exam suits you better?\nIt depends on what you want to study.`))).not.toContain('plan-verdict');
    expect(codes(withPlan(plan({ kind: 'hub', exams: ['NID'], requiredFactIds: [] }), `${goodDraft.body} NID is harder than it looks.`))).not.toContain('plan-verdict');
  });
  it('requires the online fact on a page that names it', () => {
    expect(codes(withPlan(plan({ kind: 'region', exams: [], requiredFactIds: [], onlineFactId: 'afd-online-coaching' }), FULL))).toContain('plan-facts');
  });
  it('blocks a page that reads like its sibling, with what the page must say instead', () => {
    const found = contentCheck(withPlan(plan(), FULL), rules, [{ label: 'NIFT vs UCEED', body: FULL }]).blocking.find((f) => f.code === 'plan-duplicate');
    expect(found?.message).toContain('NIFT vs UCEED');
    expect(found?.message).toContain('who each exam suits');
  });
  it('does nothing to a page with no plan', () => { expect(codes(goodDraft)).not.toContain('plan-facts'); });
});
