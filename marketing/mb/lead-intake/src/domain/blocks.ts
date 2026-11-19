import type { OffersConfig } from './offers.ts';
import { KIND_LABEL } from './offers.ts';
import type { ToolSpec } from './tools.ts';

// One shelf for everything a page can carry to turn a reader into an enquiry: offers (a form for a resource or a class) and
// free tools (a checker that asks for details before the answer). Both are plug-and-play blocks, so they are listed and
// placed the same way; the two kinds differ only in how they are drawn.
export interface BlockEntry {
  readonly id: string;
  readonly type: 'offer' | 'tool';
  readonly label: string;
  readonly title: string;
  // Exams it suits; empty means any.
  readonly exams: readonly string[];
}

export function blockLibrary(offers: OffersConfig | undefined, tools: readonly ToolSpec[]): BlockEntry[] {
  return [
    ...(offers?.offers ?? []).map((o): BlockEntry => ({ id: o.id, type: 'offer', label: KIND_LABEL[o.kind], title: o.title, exams: o.exams })),
    ...tools.map((t): BlockEntry => ({ id: t.id, type: 'tool', label: 'Free checker', title: t.title, exams: [t.exam] })),
  ];
}
