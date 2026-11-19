import type { AuditFinding } from './audit.ts';

// What a rework fixed and what it broke: findings that were bad and are now fine, and the other way round.
export function compareAudits(before: readonly AuditFinding[], after: readonly AuditFinding[]): { fixed: AuditFinding[]; newProblems: AuditFinding[]; stillBad: AuditFinding[] } {
  const bad = (f: AuditFinding): boolean => f.status !== 'ok';
  const was = new Map(before.map((f) => [f.id, f]));
  const now = new Map(after.map((f) => [f.id, f]));
  return {
    fixed: before.filter((f) => bad(f) && now.get(f.id) !== undefined && !bad(now.get(f.id) as AuditFinding)),
    newProblems: after.filter((f) => bad(f) && (was.get(f.id) === undefined || !bad(was.get(f.id) as AuditFinding))),
    stillBad: after.filter((f) => bad(f) && was.get(f.id) !== undefined && bad(was.get(f.id) as AuditFinding)),
  };
}
