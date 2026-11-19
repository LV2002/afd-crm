// Copy-guard for free text (reel scripts, blog articles) plus structural checks for blog articles.
const DASH = /[–—]/;
const PH = /\{\{fact:([a-z0-9-]+)\}\}/g;
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

export function guard(text, rules, facts) {
  const blocking = []; const advisory = [];
  if (DASH.test(text)) blocking.push('Contains an em or en dash.');
  const low = text.toLowerCase();
  for (const p of rules.bannedPhrases) if (low.includes(p)) blocking.push(`Banned phrase "${p}".`);
  for (const p of rules.stockOpeners ?? []) if (low.includes(p)) advisory.push(`Stock opener "${p}".`);
  for (const w of rules.bannedWords) if (new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, 'i').test(text)) blocking.push(`Banned word "${w}" (no fees or prices).`);
  for (const s of rules.bannedSymbols) if (text.includes(s)) blocking.push(`Banned symbol "${s}".`);
  for (const m of text.matchAll(PH)) if (!facts.has(m[1])) blocking.push(`Unknown or unverified fact "${m[1]}".`);
  const stripped = text.replace(PH, '');
  if (/\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(stripped) || /\b20(2[6-9]|3\d)\b/.test(stripped))
    advisory.push('A typed date or year appears; use a {{fact:id}} placeholder.');
  if (/\bI (remember|once|used to|was a student|met a)\b/i.test(text)) blocking.push('Looks like a personal anecdote ("I" is for advice only).');
  return { blocking, advisory };
}

// Parses the blog output format: SEO_TITLE / META_DESCRIPTION / SLUG / === / markdown.
export function parseBlog(text) {
  const head = {}; const i = text.indexOf('\n===\n');
  if (i < 0) return { error: 'Missing the "===" line between the header and the article.' };
  for (const line of text.slice(0, i).split('\n')) { const m = /^(SEO_TITLE|META_DESCRIPTION|SLUG):\s*(.*)$/.exec(line.trim()); if (m) head[m[1]] = m[2].trim(); }
  return { head, body: text.slice(i + 5) };
}

export function checkBlog(text, keyword, secondary = []) {
  const blocking = []; const advisory = [];
  const p = parseBlog(text); if (p.error) return { blocking: [p.error], advisory };
  const { head, body } = p; const k = keyword.toLowerCase();
  const t = head.SEO_TITLE ?? ''; const m = head.META_DESCRIPTION ?? ''; const s = head.SLUG ?? '';
  if (!t || t.length > 60) blocking.push(`SEO_TITLE must be 1 to 60 characters (is ${t.length}).`);
  if (!t.toLowerCase().includes(k)) advisory.push('SEO_TITLE should contain the main keyword.');
  if (m.length < 120 || m.length > 155) blocking.push(`META_DESCRIPTION must be 120 to 155 characters (is ${m.length}).`);
  if (!m.toLowerCase().includes(k)) advisory.push('META_DESCRIPTION should contain the main keyword.');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) blocking.push('SLUG must be lowercase words joined by hyphens.');
  const lines = body.split('\n');
  const h1 = lines.filter((l) => /^# /.test(l)); const h2 = lines.filter((l) => /^## /.test(l));
  if (h1.length !== 1) blocking.push(`Exactly one H1 is required (found ${h1.length}).`);
  else if (!h1[0].toLowerCase().includes(k)) blocking.push('The H1 must contain the main keyword.');
  if (!h2.some((l) => /key takeaways/i.test(l))) blocking.push('Missing a "## Key takeaways" section.');
  if (h2.filter((l) => l.trim().endsWith('?')).length < 2) blocking.push('At least two H2 headings must be written as questions.');
  if (!h2.some((l) => l.toLowerCase().includes(k))) blocking.push('The main keyword must appear in at least one H2.');
  if (lines.some((l) => /^#{4,} /.test(l))) blocking.push('Only H2 and H3 headings are allowed below the H1.');
  if (/!\[/.test(body)) blocking.push('No images in the article body.');
  const n = (body.toLowerCase().split(k).length - 1);
  if (n < 4 || n > 6) advisory.push(`Main keyword used ${n} times; 4 to 6 is the target.`);
  const w = words(body.replace(/\{\{[^}]+\}\}/g, ''));
  if (w < 900 || w > 1200) advisory.push(`${w} words; 900 to 1,200 is the target for a new article.`);
  if (!/## Frequently asked questions/i.test(body)) advisory.push('Consider a "## Frequently asked questions" section (3 to 5 questions).');
  for (const sk of secondary) if (!body.toLowerCase().includes(sk.toLowerCase())) advisory.push(`Secondary keyword "${sk}" is not used.`);
  const intro = body.split(/\n## /)[0].replace(/^# .*\n/, '');
  if (words(intro) > 100) advisory.push(`Introduction is ${words(intro)} words; the maximum is 100.`);
  return { blocking, advisory };
}
