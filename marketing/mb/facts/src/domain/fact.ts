import { z } from 'zod';

// official        read on the exam body's own site or brochure
// owner_verified  the owner has checked it
// secondary       only on a news or coaching site
// pending         not announced yet
export const FactStatus = z.enum(['official', 'owner_verified', 'secondary', 'pending']);
export type FactStatus = z.infer<typeof FactStatus>;

export const FactSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  exam: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
  source: z.string().min(1),
  status: FactStatus,
  // Set when the fact is a date the app should count down to (deadlines, exam days): yyyy-mm-dd, India time.
  date: z.iso.date().optional(),
});
export type Fact = z.infer<typeof FactSchema>;

// The writer may state a fact only if it came from an official source or the owner confirmed it.
// Anything else is flagged for review (CLAUDE.md: never invent facts about AFD India or the exams).
export const isUsable = (fact: Pick<Fact, 'status'>): boolean => fact.status === 'official' || fact.status === 'owner_verified';
