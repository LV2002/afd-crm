import { describe, expect, it } from 'vitest';
import { auditPage, extractPageFacts, findTemplateImages, type AuditContext } from '../src/index.ts';
import { badPage, goodPage } from './pages.ts';

const ctx: AuditContext = {
  cycleYear: 2027,
  knownPhones: ['9895484652', '9895484651'],
  templateImages: new Set(['/logo.png']),
  officialDomains: ['admissions.nid.edu', 'uceed.iitb.ac.in'],
};
const audit = (html: string, path = '/page/nid-dat-prelims') => auditPage(extractPageFacts(html, `https://afdindia.com${path}`, 200), ctx);
const bad = (findings: ReturnType<typeof audit>): string[] => findings.filter((f) => f.status !== 'ok').map((f) => f.id);

describe('extractPageFacts', () => {
  const facts = extractPageFacts(goodPage, 'https://afdindia.com/page/nid-dat-prelims', 200);

  it('reads the basics', () => {
    expect(facts.title).toContain('NID DAT Prelims');
    expect(facts.canonical).toBe('https://afdindia.com/page/nid-dat-prelims');
    expect(facts.headings[0]).toEqual({ level: 1, text: 'NID DAT Prelims 2027' });
    expect(facts.forms[0]?.hasPhone).toBe(true);
    expect(facts.telLinks).toEqual(['tel:+919895484652']);
    expect([...facts.phoneNumbers].sort()).toEqual(['9895484651', '9895484652']);
    expect(facts.jsonLd[0]).toEqual({ types: ['FAQPage'], valid: true });
    expect(facts.hasByline).toBe(true);
  });

  it('ignores the footer copyright when reading years', () => {
    expect(facts.years).toEqual([2027]);
  });

  it('measures the answer under each question heading', () => {
    expect(facts.sections.find((s) => s.heading.startsWith('How do you'))?.answerWords).toBeGreaterThan(25);
  });
});

describe('auditPage', () => {
  it('finds nothing wrong with a good page', () => {
    expect(bad(audit(goodPage))).toEqual([]);
  });

  it('finds the problems on a bad page', () => {
    expect(bad(audit(badPage, '/page/old-exam'))).toEqual(expect.arrayContaining([
      'noindex', 'title', 'meta-description', 'h1', 'heading-order', 'thin-content', 'schema-valid', 'schema-event',
      'page-meta', 'lead-form', 'call-whatsapp', 'phone-numbers', 'image-alt', 'answer-ready', 'takeaways', 'fresh-dates',
    ]));
  });

  it('flags a phone number that is not ours', () => {
    const f = audit(badPage).find((x) => x.id === 'phone-numbers');
    expect(f?.status).toBe('fail');
    expect(f?.detail).toContain('9000011111');
  });

  it('does not count template images (the logo) as missing alt text', () => {
    expect(audit(badPage).find((x) => x.id === 'image-alt')?.detail).toContain('1 image');
  });

  it('wants a byline and an official source on blog posts, but not on other pages', () => {
    const blog = audit(goodPage.replace('By Julie James. ', '').replace('https://admissions.nid.edu', 'https://example.com'), '/blog/post/x');
    expect(bad(blog)).toEqual(expect.arrayContaining(['author', 'official-source']));
    expect(bad(audit(goodPage))).not.toContain('author');
  });

  it('finds the template images that most pages share', () => {
    const pages = [goodPage, badPage, '<img src="/logo.png" alt="">'].map((h) => extractPageFacts(h, 'https://afdindia.com/x', 200));
    expect([...findTemplateImages(pages)]).toEqual(['/logo.png']);
  });
});
