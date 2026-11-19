import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { FORM_SCRIPT, ToolsConfigSchema, footerScript, renderTool } from '../src/index.ts';

const root = new URL('../../../config/', import.meta.url);
const spec = ToolsConfigSchema.parse(JSON.parse(readFileSync(new URL('tools.json', root), 'utf8'))).tools.find((t) => t.id === 'age-uceed');
const ENDPOINT = 'https://script.google.com/macros/s/ABC/exec';

function open(fetchOk = true) {
  if (spec === undefined) throw new Error('no tool');
  const dom = new JSDOM(`<body>${renderTool(spec, { id: spec.factId, value: 'x' })}</body>`, { url: 'https://afdindia.com/page/x', runScripts: 'outside-only' });
  const fetchMock = vi.fn(() => Promise.resolve({ ok: fetchOk }));
  Object.assign(dom.window, { fetch: fetchMock, AFD_ENDPOINT: ENDPOINT, dataLayer: [] });
  dom.window.eval(footerScript(FORM_SCRIPT));
  const d = dom.window.document;
  const set = (name: string, value: string): void => { const n = d.querySelector<HTMLInputElement>(`.afd-tool [name=${name}]`); if (n === null) throw new Error(name); n.value = value; };
  const submit = (): void => { d.querySelector('.afd-tool form')?.dispatchEvent(new dom.window.Event('submit', { cancelable: true })); };
  // The page also fetches the facts feed on load; only the posts are leads.
  const posts = (): [string, { body: URLSearchParams }][] => (fetchMock.mock.calls as unknown as [string, { method?: string; body: URLSearchParams }][]).filter((c) => c[1].method === 'POST');
  const result = (): string => (d.querySelector<HTMLElement>('.afd-tool-out')?.hidden === false ? d.querySelector('.afd-tool-out')?.textContent ?? '' : '');
  return { d, set, submit, result, posts };
}

describe('a free tool with a lead address', () => {
  it('asks for name, phone and date of birth, sends the lead, then shows the result', async () => {
    const t = open();
    t.set('name', 'Asha'); t.set('phone', '9895484652'); t.set('dob', '2003-01-01');
    t.submit();
    await vi.waitFor(() => { expect(t.result()).toContain('You meet this age rule.'); });
    const call = t.posts()[0];
    expect(call?.[0]).toBe(ENDPOINT);
    expect(call?.[1].body.get('name')).toBe('Asha');
    expect(call?.[1].body.get('dob')).toBe('2003-01-01');
    expect(call?.[1].body.get('form')).toBe('tool-age-uceed');
    expect(call?.[1].body.get('exam')).toBe('UCEED');
    expect(call?.[1].body.get('submission_id')).not.toBe('');
  });

  it('shows no result and sends nothing when the phone number is not a real one', () => {
    const t = open();
    t.set('name', 'Asha'); t.set('phone', '123'); t.set('dob', '2003-01-01');
    t.submit();
    expect(t.posts()).toHaveLength(0);
    expect(t.result()).toBe('');
    expect(t.d.querySelector('[data-afd-error]')?.textContent).toContain('10 digit');
  });

  it('does not send a lead when the date of birth is missing', () => {
    const t = open();
    t.set('name', 'Asha'); t.set('phone', '9895484652');
    t.submit();
    expect(t.posts()).toHaveLength(0);
    expect(t.result()).toBe('Please enter your date of birth.');
  });
});
