import { readFileSync } from 'node:fs';
import { isUsable, type Fact } from '@mb/facts';
import { ToolsConfigSchema, renderTool, toolProblems, type ToolSpec } from '@mb/lead-intake';

// Ported from Marketing Brain. A free tool is used only when the fact it draws from is confirmed AND its rule says what that fact says.
export function toolSpecs(path: string): readonly ToolSpec[] {
  try { const c = ToolsConfigSchema.safeParse(JSON.parse(readFileSync(path, 'utf8'))); return c.success ? c.data.tools : []; } catch { return []; }
}

export function toolBlocks(specs: readonly ToolSpec[], facts: ReadonlyMap<string, Fact>): { byId: ReadonlyMap<string, string>; byExam: ReadonlyMap<string, string> } {
  const byId = new Map<string, string>(); const byExam = new Map<string, string>();
  for (const spec of specs) {
    const fact = facts.get(spec.factId);
    if (fact === undefined || !isUsable(fact) || toolProblems(spec, fact.value).length > 0) continue;
    const block = renderTool(spec, fact);
    byId.set(spec.id, block);
    if (!byExam.has(spec.exam)) byExam.set(spec.exam, block);
  }
  return { byId, byExam };
}
