export interface Block {
  readonly kind: 'heading' | 'paragraph' | 'list' | 'other';
  readonly level: number; // heading level, 0 otherwise
  readonly text: string;
}

const wordsIn = (text: string): string[] => text.split(/\s+/).filter((w) => w !== '');
export const countWords = (text: string): number => wordsIn(text).length;

// A deliberately small reader for the markdown the writer produces: headings, paragraphs, lists, tables.
export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', level: 0, text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (line === '') flush();
    else if (heading !== null) { flush(); blocks.push({ kind: 'heading', level: heading[1]?.length ?? 1, text: heading[2] ?? '' }); }
    else if (/^([-*]|\d+\.)\s/.test(line)) { flush(); blocks.push({ kind: 'list', level: 0, text: line }); }
    else if (line.startsWith('|')) { flush(); blocks.push({ kind: 'other', level: 0, text: line }); }
    else paragraph.push(line);
  }
  flush();
  return blocks;
}

// Plain reading text: no markup, no fact tokens.
export const plainText = (body: string): string =>
  body
    .replace(/\{\{fact:[a-z0-9-]+\}\}/g, 'X')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>*\-\s|]+/gm, '')
    .replace(/[*_`]/g, '');

// Lower-case words only, so "NID DAT" matches "nid-dat" in a slug and "NID  DAT" in a sentence.
export const normalise = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const contains = (text: string, phrase: string): boolean => ` ${normalise(text)} `.includes(` ${normalise(phrase)} `);
export function occurrences(text: string, phrase: string): number {
  const haystack = ` ${normalise(text)} `;
  const needle = ` ${normalise(phrase)} `;
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length - 1)) count++;
  return count;
}
