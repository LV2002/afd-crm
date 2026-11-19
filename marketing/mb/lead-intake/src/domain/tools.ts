import { z } from 'zod';

// Free tools a visitor can use on a page, as plug-in blocks: an age check against an exam's official rule, and a short "can I apply" check. Each is data (config/tools.json),
// draws from one confirmed fact, and works out its answer in the visitor's browser. When the site has a lead address, the visitor's name and phone go through the usual signed route first. The rule in the tool must match the words of its fact;
// `toolProblems` compares the two, so a tool is never shown with a rule the official source does not say.
const Id = z.string().regex(/^[a-z0-9-]+$/);
const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const DobCutoff = z.object({
  kind: z.literal('dob-cutoff'), id: Id, exam: z.string(), title: z.string(), factId: z.string(), note: z.string(),
  categories: z.array(z.object({ label: z.string(), bornOnOrAfter: Iso })).min(1),
});
const AgeOnDate = z.object({
  kind: z.literal('age-on-date'), id: Id, exam: z.string(), title: z.string(), factId: z.string(), note: z.string(),
  asOn: Iso, youngerThanYears: z.number().int().min(10).max(60),
  categories: z.array(z.object({ label: z.string(), extraYears: z.number().int().min(0).max(10) })).min(1),
});
const Choice = z.object({
  kind: z.literal('choice'), id: Id, exam: z.string(), title: z.string(), factId: z.string(), note: z.string(),
  questions: z.array(z.object({ id: Id, text: z.string(), options: z.array(z.object({ value: Id, label: z.string() })).min(2) })).min(1),
  // The first outcome whose `when` matches every answer given (a missing key matches anything) is shown.
  outcomes: z.array(z.object({ when: z.record(z.string(), z.string()), verdict: z.enum(['yes', 'no', 'check']), text: z.string() })).min(1),
});

export const ToolSpecSchema = z.discriminatedUnion('kind', [DobCutoff, AgeOnDate, Choice]);
export const ToolsConfigSchema = z.object({ tools: z.array(ToolSpecSchema) });
export type ToolSpec = z.infer<typeof ToolSpecSchema>;
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = (iso: string): string => `${String(Number(iso.slice(8, 10)))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''} ${iso.slice(0, 4)}`;

// The tool's rule against the words of its fact. A date in the tool that the fact does not say, or a fact that says something else, is a problem.
export function toolProblems(spec: ToolSpec, factValue: string): string[] {
  const out: string[] = [];
  const text = factValue.toLowerCase();
  if (spec.kind === 'dob-cutoff') {
    for (const c of spec.categories) if (!text.includes(longDate(c.bornOnOrAfter).toLowerCase())) out.push(`the fact does not say ${longDate(c.bornOnOrAfter)} (${c.label})`);
  } else if (spec.kind === 'age-on-date') {
    if (!text.includes(longDate(spec.asOn).toLowerCase())) out.push(`the fact does not say ${longDate(spec.asOn)}`);
    if (!new RegExp(`\\b(under|below|less than|younger than)\\s+${String(spec.youngerThanYears)}\\b`).test(text)) out.push(`the fact does not say under ${String(spec.youngerThanYears)}`);
    for (const c of spec.categories.filter((x) => x.extraYears > 0)) if (!new RegExp(`\\b${String(c.extraYears)}\\s+years?\\b`).test(text) && !new RegExp(`\\b(${['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][c.extraYears - 1] ?? 'x'})\\s+years?\\b`).test(text)) out.push(`the fact does not say ${String(c.extraYears)} years of relaxation (${c.label})`);
  }
  return out;
}

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The block placed in the page: markup only. The footer script reads the rule from data-afd-tool and builds the form. Without the script it
// still shows the title, the official rule and a note, so the page never shows an empty box.
export function renderTool(spec: ToolSpec, fact: { readonly id: string; readonly value: string }): string {
  return `<div class="afd-tool" data-afd-tool="${attr(JSON.stringify(spec))}"><p class="afd-tool-h">${text(spec.title)}</p>`
    + `<p class="afd-tool-src">The official rule: <span data-afd-fact="${attr(fact.id)}">${text(fact.value)}</span></p>`
    + `<div class="afd-tool-body"></div><p class="afd-tool-note">${text(spec.note)}</p></div>`;
}
