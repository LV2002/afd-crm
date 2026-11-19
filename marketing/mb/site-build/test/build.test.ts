import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBlog, parseBlogDraft } from '../src/index.ts';

const root = new URL('../../../', import.meta.url).pathname;
const sample = readFileSync(`${root}tools/test/fixtures/blog-sample.md`, 'utf8');
const now = new Date('2026-11-19T06:00:00Z');
const endpoint = 'https://script.google.com/macros/s/TEST/exec';

describe('blog draft to Knorish package', () => {
  it('parses the draft format', () => {
    const p = parseBlogDraft(sample);
    expect(p.ok && p.value.slug).toBe('nid-dat-preparation');
    expect(parseBlogDraft('no header').ok).toBe(false);
  });

  it('builds the six pieces from a good draft, with facts, form and article-only body', () => {
    const r = buildBlog(root, sample, { now, endpoint });
    if (!r.ok) throw new Error(r.error.join('; '));
    const { pkg } = r.value;
    expect(pkg.metaTitle).toBe('NID DAT preparation: a simple weekly plan');
    expect(pkg.metaKeywords).toBe('NID DAT, studio test');
    expect(pkg.pageBody).toContain('Sunday 20 December 2026');
    expect(pkg.pageBody).toContain(`data-endpoint="${endpoint}"`);
    expect(pkg.headerCode).toContain('"@type":"FAQPage"');
    expect(pkg.footerCode).toContain(endpoint);
    // everything except the site's own navigation and footer
    expect(pkg.pageBody).not.toMatch(/<footer|navbar|site-header|site-footer/i);
    expect(pkg.pageBody).not.toMatch(/<script|<style/);
    expect(pkg.pageBody).toContain('class="afd-post"');
  });

  it('credits every blog post to Julie James, academic director, with her author card and a linked Person in the markup', () => {
    const r = buildBlog(root, sample, { now, endpoint });
    if (!r.ok) throw new Error(r.error.join('; '));
    const { pkg } = r.value;
    expect(pkg.pageBody).toContain('<b>Julie James</b>, Academic Director');
    expect(pkg.pageBody).toContain('class="ap-author"');
    expect(pkg.pageBody).toContain('<a href="https://afdindia.com/page/julie-james-design-tutor">Julie James</a>');
    const person = /"author":(\{[^}]*\})/.exec(pkg.headerCode)?.[1] ?? '';
    expect(JSON.parse(person)).toEqual({ '@type': 'Person', name: 'Julie James', url: 'https://afdindia.com/page/julie-james-design-tutor', jobTitle: 'Academic Director' });
  });

  it('refuses to build without a form address, so the live endpoint never has to live in the repo', () => {
    const r = buildBlog(root, sample, { now });
    expect(!r.ok && r.error.join(' ')).toMatch(/LEAD_FORM_ENDPOINT/);
  });

  it('stops on fees, unknown facts, and an unverified NIFT date', () => {
    const fee = sample.replace('Practise every day', 'The fee is Rs 500. Practise every day');
    expect(buildBlog(root, fee, { now, endpoint }).ok).toBe(false);
    const unknown = sample.replace('{{fact:nid-2027-dat-prelims-date}}', '{{fact:made-up-fact}}');
    expect(buildBlog(root, unknown, { now, endpoint }).ok).toBe(false);
    const nift = sample.replace('{{fact:nid-2027-dat-prelims-date}}', '{{fact:nift-2027-exam-date}}');
    const r = buildBlog(root, nift, { now, endpoint });
    expect(!r.ok && r.error.join(' ')).toMatch(/nift-2027-exam-date/);
  });

  it('needs a primary keyword in the front-matter', () => {
    const r = buildBlog(root, sample.replace('primary_keyword: NID DAT\n', ''), { now, endpoint });
    expect(!r.ok && r.error.join(' ')).toMatch(/primary_keyword/);
  });
});
