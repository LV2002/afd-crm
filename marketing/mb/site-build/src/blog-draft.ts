// A blog draft file as the blog-writer agent writes it: front-matter, then SEO_TITLE / META_DESCRIPTION / SLUG, a "===" line, and markdown.
import { err, ok, type Result } from '@mb/platform';

export interface BlogDraftFile {
  readonly meta: Readonly<Record<string, string>>;
  readonly seoTitle: string;
  readonly metaDescription: string;
  readonly slug: string;
  readonly body: string;
}

const csv = (s: string | undefined): string[] => (s ?? '').replace(/^\[|\]$/g, '').split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter((x) => x !== '');
export const listOf = csv;

export function parseBlogDraft(text: string): Result<BlogDraftFile, string> {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const meta: Record<string, string> = {};
  if (fm?.[1] !== undefined) for (const line of fm[1].split('\n')) { const m = /^([A-Za-z_]+):\s*(.*)$/.exec(line); if (m?.[1] !== undefined) meta[m[1]] = (m[2] ?? '').trim(); }
  const rest = fm === null ? text : text.slice(fm[0].length);
  const i = rest.indexOf('\n===\n');
  if (i < 0) return err('The draft needs SEO_TITLE, META_DESCRIPTION and SLUG lines, then a line with only "===", then the article.');
  const head: Record<string, string> = {};
  for (const line of rest.slice(0, i).split('\n')) { const m = /^(SEO_TITLE|META_DESCRIPTION|SLUG):\s*(.*)$/.exec(line.trim()); if (m?.[1] !== undefined) head[m[1]] = (m[2] ?? '').trim(); }
  const seoTitle = head['SEO_TITLE'] ?? ''; const metaDescription = head['META_DESCRIPTION'] ?? ''; const slug = head['SLUG'] ?? '';
  if (seoTitle === '' || metaDescription === '' || slug === '') return err('SEO_TITLE, META_DESCRIPTION and SLUG must all be present.');
  // Anything after a fenced "faq-json" block (older drafts) is ignored: the builder makes the FAQ markup from the visible questions.
  const body = rest.slice(i + 5).replace(/\n```json[\s\S]*?```\s*$/m, '').trim();
  return ok({ meta, seoTitle, metaDescription, slug, body });
}
