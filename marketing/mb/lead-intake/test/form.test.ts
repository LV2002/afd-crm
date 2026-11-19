import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { FORM_SCRIPT, LeadFormsConfigSchema, renderLeadForm } from '../src/index.ts';

const config = LeadFormsConfigSchema.parse({
  endpoint: 'https://script.google.com/macros/s/ABC/exec',
  centres: [{ id: 'kochi', name: 'Kochi', phone: '9895484652', whatsapp: '919895484652' }],
  primaryCentreId: 'kochi',
  exams: ['NIFT', 'NID', 'Not sure yet'],
});

function html(exam?: string): string {
  const r = renderLeadForm({ config, label: 'Book a demo', formId: 'f1', ...(exam === undefined ? {} : { exam }) });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function page(path: string, markup: string, search = '') {
  const dom = new JSDOM(`<body>${markup}</body>`, { url: `https://afdindia.com${path}${search}`, runScripts: 'outside-only' });
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
  Object.assign(dom.window, { fetch: fetchMock });
  dom.window.eval(FORM_SCRIPT);
  return { dom, fetchMock, doc: dom.window.document };
}

const fill = (doc: Document, v: Record<string, string>): HTMLFormElement => {
  const form = doc.querySelector<HTMLFormElement>('form[data-afd-lead]');
  if (!form) throw new Error('no form');
  for (const [k, val] of Object.entries(v)) (form.elements.namedItem(k) as HTMLInputElement).value = val;
  return form;
};
const submit = async (form: HTMLFormElement): Promise<void> => {
  form.dispatchEvent(new form.ownerDocument.defaultView!.Event('submit', { cancelable: true })); // eslint-disable-line @typescript-eslint/no-non-null-assertion -- jsdom documents always have a window
  await new Promise((r) => setTimeout(r, 0));
};

describe('renderLeadForm', () => {
  it('has name, phone, optional email, exam, honeypot and the endpoint', () => {
    const out = html();
    for (const name of ['name', 'phone', 'email', 'exam', 'company_website']) expect(out).toContain(`name="${name}"`);
    expect(out).toContain('data-endpoint="https://script.google.com/macros/s/ABC/exec"');
    expect(out).toContain('data-crm-form="Book a demo"');
    expect(out).toContain('https://wa.me/919895484652');
  });

  it('preselects the exam, and refuses an unknown exam or a missing endpoint', () => {
    expect(html('NID')).toContain('value="NID" selected');
    expect(renderLeadForm({ config, label: 'x', formId: 'f', exam: 'GRE' }).ok).toBe(false);
    expect(renderLeadForm({ config: { ...config, endpoint: '' }, label: 'x', formId: 'f' }).ok).toBe(false);
  });

  it('escapes the label', () => {
    const r = renderLeadForm({ config, label: '"><script>x</script>', formId: 'f' });
    expect(r.ok && r.value.includes('<script>')).toBe(false);
  });
});

describe('footer script', () => {
  it('adds form, page and page_url to every form but never overwrites one the form has', () => {
    const { doc } = page('/page/nift-coaching', '<form id="old" action="/x"><input type="hidden" name="page" value="/mine"></form>' + html(), '?utm_source=meta');
    const old = doc.querySelector('#old') as HTMLFormElement;
    expect((old.elements.namedItem('form') as HTMLInputElement).value).toBe('old');
    expect((old.elements.namedItem('page') as HTMLInputElement).value).toBe('/mine');
    expect((old.elements.namedItem('page_url') as HTMLInputElement).value).toContain('utm_source=meta');
    const ours = doc.querySelector('form[data-afd-lead]') as HTMLFormElement;
    expect((ours.elements.namedItem('form') as HTMLInputElement).value).toBe('Book a demo');
    expect((ours.elements.namedItem('page') as HTMLInputElement).value).toBe('/page/nift-coaching');
  });

  it('does nothing under /publisher or /user', () => {
    for (const path of ['/publisher/x', '/user', '/user/profile']) {
      const { doc } = page(path, html());
      expect(doc.querySelector('input[name="page"]')).toBeNull();
    }
  });

  it('posts name, phone, email, exam, page, form, campaign details and a submission id', async () => {
    const { doc, fetchMock } = page('/page/nift-coaching', html(), '?utm_source=meta&gclid=g1');
    await submit(fill(doc, { name: 'Asha', phone: '98954 84652', email: 'a@b.co', exam: 'NIFT' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }];
    const body = call[1].body;
    expect(call[0]).toBe('https://script.google.com/macros/s/ABC/exec');
    expect(Object.fromEntries(body)).toMatchObject({ name: 'Asha', phone: '9895484652', email: 'a@b.co', exam: 'NIFT', page: '/page/nift-coaching', form: 'Book a demo', utm_source: 'meta', gclid: 'g1' });
    expect(body.get('submission_id')).toBeTruthy();
    expect(body.has('company_website')).toBe(false);
    expect(doc.querySelector<HTMLElement>('[data-afd-thanks]')?.hidden).toBe(false);
  });

  it('rejects a short phone number without sending', async () => {
    const { doc, fetchMock } = page('/page/x', html());
    await submit(fill(doc, { name: 'Asha', phone: '12345', exam: 'NIFT' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(doc.querySelector<HTMLElement>('[data-afd-error]')?.hidden).toBe(false);
  });

  it('pretends success to a bot and sends nothing', async () => {
    const { doc, fetchMock } = page('/page/x', html());
    await submit(fill(doc, { name: 'Bot', phone: '9895484652', exam: 'NIFT', company_website: 'spam.example' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(doc.querySelector<HTMLElement>('[data-afd-thanks]')?.hidden).toBe(false);
  });

  it('shows an error and lets the visitor retry when sending fails', async () => {
    const { doc, dom } = page('/page/x', html());
    Object.assign(dom.window, { fetch: vi.fn(() => Promise.resolve({ ok: false })) });
    const form = fill(doc, { name: 'Asha', phone: '9895484652', exam: 'NIFT' });
    await submit(form);
    expect(doc.querySelector<HTMLElement>('[data-afd-error]')?.hidden).toBe(false);
    expect(form.hidden).toBe(false);
    expect(form.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false);
  });
});

describe('the form design', () => {
  it('is put on the page once by the footer script, so the form snippet itself carries no styling', () => {
    expect(html()).not.toContain('<style');
    expect(html()).not.toContain('style="');
    const { doc } = page('/page/nift-coaching', html());
    const styles = doc.querySelectorAll('style[data-afd-form]');
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain('.afd-lead');
    expect(doc.querySelector('link[href*="Montserrat"]')).not.toBeNull();
  });

  it('is not added twice when the script runs again, and not at all on a page with no form', () => {
    const { dom, doc } = page('/page/x', html());
    dom.window.eval(FORM_SCRIPT);
    expect(doc.querySelectorAll('style[data-afd-form]')).toHaveLength(1);
    expect(page('/page/y', '<p>No form here</p>').doc.querySelectorAll('style[data-afd-form]')).toHaveLength(0);
  });

  it('does not depend on the page around it: the design sets its own colours, fonts and sizes', async () => {
    const { FORM_CSS } = await import('../src/index.ts');
    for (const needle of ['--o:#D84315', 'Montserrat', '.afd-lead input', '.afd-lead button[type=submit]', '[data-afd-thanks]']) expect(FORM_CSS).toContain(needle);
    expect(FORM_CSS).not.toMatch(/[—–]/);
  });
});

describe('reading aids on an article page', () => {
  const article = '<article id="afd-post"><div class="ap-prog"><i></i></div><aside class="ap-side"><nav class="ap-toc"><a href="#one">One</a><a href="#two">Two</a></nav></aside><section id="one">a</section><section id="two">b</section></article>';

  it('runs without error and leaves the page alone when the browser has no observer', () => {
    const { doc } = page('/blog/post/x', article);
    expect(doc.querySelectorAll('.ap-toc a')).toHaveLength(2);
  });

  it('marks the section being read in the contents list', () => {
    const dom = new JSDOM(`<body>${article}</body>`, { url: 'https://afdindia.com/blog/post/x', runScripts: 'outside-only' });
    let report: ((entries: { isIntersecting: boolean; target: Element }[]) => void) | undefined;
    class FakeObserver { constructor(cb: typeof report) { report = cb; } observe(): void {} }
    Object.assign(dom.window, { IntersectionObserver: FakeObserver, fetch: vi.fn() });
    dom.window.eval(FORM_SCRIPT);
    const two = dom.window.document.getElementById('two');
    if (two === null || report === undefined) throw new Error('not wired');
    report([{ isIntersecting: true, target: two }]);
    const on = [...dom.window.document.querySelectorAll('.ap-toc a.on')].map((a) => a.textContent);
    expect(on).toEqual(['Two']);
  });
});

describe('footer script: a free resource', () => {
  const resourceForm = (): string => {
    const r = renderLeadForm({ config, label: 'Free download: NID papers', formId: 'f9', exam: 'NID', fields: 'resource', openLabel: 'Open my download', hidden: { resource_id: 'nid-papers' } });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const run = async (reply: unknown) => {
    const dom = new JSDOM(`<body>${resourceForm()}</body>`, { url: 'https://afdindia.com/page/nid', runScripts: 'outside-only' });
    const opened: string[] = [];
    Object.assign(dom.window, { fetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(reply) })), open: (u: string) => { opened.push(u); return null; } });
    dom.window.eval(FORM_SCRIPT);
    const doc = dom.window.document;
    await submit(fill(doc, { name: 'Asha', phone: '9895484652', email: 'a@b.co' }));
    return { doc, opened };
  };

  it('shows a big button to the private link and opens it in a new tab', async () => {
    const { doc, opened } = await run({ ok: true, download: 'https://script.google.com/macros/s/ABC/exec?dl=tok' });
    const a = doc.querySelector<HTMLAnchorElement>('[data-afd-thanks] a.afd-open');
    expect(a?.href).toContain('?dl=tok');
    expect(a?.target).toBe('_blank');
    expect(opened).toEqual(['https://script.google.com/macros/s/ABC/exec?dl=tok']);
  });

  it('says so, and points to WhatsApp, when no link came back', async () => {
    const { doc, opened } = await run({ ok: true });
    expect(doc.querySelector('[data-afd-thanks]')?.textContent).toContain('could not open here');
    expect(opened).toEqual([]);
  });
});

describe('a phone number is exactly ten digits', () => {
  const send = async (phone: string) => {
    const { doc, fetchMock } = page('/page/x', html('NIFT'));
    await submit(fill(doc, { name: 'Asha', phone, exam: 'NIFT' }));
    const posted = (fetchMock.mock.calls as unknown as [string, { method?: string; body: URLSearchParams }][]).find((c) => c[1].method === 'POST');
    return { doc, phone: posted?.[1].body.get('phone') };
  };

  it('sends a ten digit number, cleaned of spaces and dashes', async () => {
    expect((await send('98954-84652')).phone).toBe('9895484652');
  });
  it('drops a leading +91, 91 or 0 rather than refusing a number typed the usual way', async () => {
    expect((await send('+91 98954 84652')).phone).toBe('9895484652');
    expect((await send('09895484652')).phone).toBe('9895484652');
  });
  it('refuses nine digits, and anything that is not a number, without sending', async () => {
    for (const bad of ['989548465', 'abcdefghij', '']) {
      const r = await send(bad);
      expect(r.phone).toBeUndefined();
      expect(r.doc.querySelector('[data-afd-error]')?.textContent).toBe('Please enter a 10 digit mobile number.');
    }
  });
  it('stops typing at ten digits and takes out anything else as it is typed', () => {
    const { doc, dom } = page('/page/x', html('NIFT'));
    const input = doc.querySelector<HTMLInputElement>('input[name=phone]');
    if (input === null) throw new Error('no phone box');
    input.value = '98a95-484652 99';
    input.dispatchEvent(new dom.window.Event('input'));
    expect(input.value).toBe('9895484652');
    expect(input.maxLength).toBe(10);
    expect(input.getAttribute('pattern')).toBe('[0-9]{10}');
  });
});
