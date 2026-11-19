import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { FORM_SCRIPT, ToolsConfigSchema, footerScript, renderTool, toolProblems, type ToolSpec } from '../src/index.ts';
import { TOOLS_SCRIPT } from '../src/domain/tools-script.ts';

const root = new URL('../../../config/', import.meta.url);
const config = ToolsConfigSchema.parse(JSON.parse(readFileSync(new URL('tools.json', root), 'utf8')));
const seed = JSON.parse(readFileSync(new URL('facts.seed.json', root), 'utf8')) as { id: string; value: string }[];
const fact = (id: string): { id: string; value: string } => { const f = seed.find((x) => x.id === id); if (f === undefined) throw new Error(`no fact ${id}`); return f; };
const spec = (id: string): ToolSpec => { const s = config.tools.find((x) => x.id === id); if (s === undefined) throw new Error(id); return s; };

function open(id: string, path = '/page/x') {
  const s = spec(id);
  const dom = new JSDOM(`<body>${renderTool(s, fact(s.factId))}</body>`, { url: `https://afdindia.com${path}`, runScripts: 'outside-only' });
  const events: unknown[] = [];
  (dom.window as unknown as { dataLayer: unknown[] }).dataLayer = events;
  dom.window.eval(TOOLS_SCRIPT);
  const d = dom.window.document;
  const set = (name: string, value: string): void => { const n = d.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`); if (n === null) throw new Error(name); n.value = value; };
  const check = (): string => { d.querySelector('form')?.dispatchEvent(new dom.window.Event('submit', { cancelable: true })); return d.querySelector('.afd-tool-out')?.textContent ?? ''; };
  return { d, set, check, events, out: () => d.querySelector('.afd-tool-out') };
}

describe('every shipped tool matches the words of its fact', () => {
  for (const s of config.tools) it(`${s.id} says only what its fact says`, () => { expect(toolProblems(s, fact(s.factId).value)).toEqual([]); });
  it('notices a tool whose rule the fact does not say', () => {
    expect(toolProblems(spec('age-nid'), 'Born on or after 1 July 2006 (General); 1 July 2004 (OBC)')).toEqual(expect.arrayContaining([expect.stringContaining('1 July 2003')]));
    expect(toolProblems(spec('age-nift'), 'Under 25 years on 1 August 2027')).toEqual(expect.arrayContaining([expect.stringContaining('under 24'), expect.stringContaining('relaxation')]));
  });
});

describe('the date of birth cut-off tool', () => {
  it('says whether a date of birth meets the rule for the chosen category, and on which date the rule turns', () => {
    const t = open('age-nid');
    t.set('category', '0'); t.set('dob', '2006-07-01');
    expect(t.check()).toBe('Born on 1 July 2006. For General or Gen-EWS the rule is born on or after 1 July 2006. You meet this age rule.');
    t.set('dob', '2006-06-30');
    expect(t.check()).toContain('You do not meet this age rule.');
    t.set('category', '2'); t.set('dob', '2001-07-01');
    expect(t.check()).toContain('For PwD the rule is born on or after 1 July 2001. You meet');
    expect(t.out()?.className).toContain('afd-tool-yes');
  });
  it('asks for a date first, and reports use to the dataLayer without the date', () => {
    const t = open('age-uceed');
    expect(t.check()).toBe('Please enter your date of birth.');
    t.set('dob', '2003-01-01');
    t.check();
    expect(t.events).toEqual([{ event: 'afd_tool_used', tool: 'age-uceed', exam: 'UCEED', verdict: 'yes' }]);
    expect(JSON.stringify(t.events)).not.toContain('2003');
  });
});

describe('the age on a date tool', () => {
  it('works out the age on the date and allows the extra years for the relaxed categories', () => {
    const t = open('age-nift');
    t.set('category', '0'); t.set('dob', '2003-08-02');
    expect(t.check()).toBe('On 1 August 2027 you will be 23 years and 11 months. For General, EWS or OBC-NCL you must be under 24. You meet this age rule.');
    t.set('dob', '2003-08-01');
    expect(t.check()).toContain('you will be 24 years and 0 months');
    expect(t.check()).toContain('You do not meet this age rule.');
    t.set('category', '1'); t.set('dob', '1999-01-01');
    expect(t.check()).toContain('you must be under 29. You meet');
  });
});

describe('the choice tool', () => {
  it('shows the first outcome that fits the answers', () => {
    const t = open('eligibility-nift');
    t.set('course', 'bftech'); t.set('maths', 'no');
    expect(t.check()).toContain('B.F.Tech needs Mathematics');
    expect(t.out()?.className).toContain('afd-tool-no');
    t.set('course', 'bdes');
    expect(t.check()).toContain('any stream');
  });
  it('asks for every answer before it answers', () => {
    const t = open('eligibility-uceed');
    t.set('class12', 'passed-2026');
    expect(t.check()).toBe('Please answer every question.');
    t.set('attempts', 'none');
    expect(t.check()).toContain('you can apply');
    t.set('class12', 'other');
    expect(t.check()).toContain('Class 12 passed in 2026');
  });
});

describe('the block and the script', () => {
  it('shows the rule and a note even when the script has not run, and escapes everything', () => {
    const html = renderTool({ ...spec('age-nid'), title: 'A <b>tool</b> & "more"' }, { id: 'nid-2027-age', value: 'Born <i>on</i> or after' });
    expect(html).toContain('A &lt;b&gt;tool&lt;/b&gt; &amp; "more"');
    expect(html).toContain('Born &lt;i&gt;on&lt;/i&gt; or after');
    expect(html).not.toMatch(/<(script|style)|\son[a-z]+=|style=/i);
    expect(html).toContain('data-afd-fact="nid-2027-age"');
  });
  it('does nothing under /publisher or /user, and on a page with no tool', () => {
    const t = open('age-nid', '/publisher/course');
    expect(t.d.querySelector('form')).toBeNull();
    expect(new JSDOM('<body><p>x</p></body>', { url: 'https://afdindia.com/page/x', runScripts: 'outside-only' }).window.eval(TOOLS_SCRIPT)).toBeUndefined();
  });
  it('is part of the footer script', () => { expect(footerScript(FORM_SCRIPT)).toContain('data-afd-tool'); });

});
