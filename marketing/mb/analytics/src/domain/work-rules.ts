import { z } from 'zod';

// The numbers behind "what to work on next". They are settings (config/work-next.json), not code, so the owner can make the
// advice more or less eager without anyone editing the program.
export const WorkRulesSchema = z.object({
  // Below this many times shown in search over the 28 days, there is too little data to advise on, and the screen says so.
  minTotalImpressions: z.number().int().min(0),
  nearPageOne: z.object({ minImpressions: z.number().int().min(1), fromPosition: z.number().min(1), toPosition: z.number().min(2) }),
  // A page whose click rate is below this share of the typical rate for its position is a title and description problem.
  lowClickRate: z.object({ minImpressions: z.number().int().min(1), belowShareOfTypical: z.number().min(0.05).max(1), maxPosition: z.number().min(1) }),
  noEnquiries: z.object({ minVisits: z.number().int().min(1), belowShareOfSiteRate: z.number().min(0).max(1) }),
  falling: z.object({ minEarlierClicks: z.number().int().min(1), dropPct: z.number().min(5).max(100) }),
  newPage: z.object({ minImpressions: z.number().int().min(1), bestPositionWorseThan: z.number().min(5) }),
  deadlineWindowDays: z.number().int().min(1),
  urgentMultiplier: z.number().min(1),
  maxItems: z.number().int().min(1).max(50),
});
export type WorkRules = z.infer<typeof WorkRulesSchema>;

export const DEFAULT_WORK_RULES: WorkRules = {
  minTotalImpressions: 300,
  nearPageOne: { minImpressions: 30, fromPosition: 4.5, toPosition: 15 },
  lowClickRate: { minImpressions: 100, belowShareOfTypical: 0.5, maxPosition: 10 },
  noEnquiries: { minVisits: 40, belowShareOfSiteRate: 0.25 },
  falling: { minEarlierClicks: 20, dropPct: 30 },
  newPage: { minImpressions: 40, bestPositionWorseThan: 20 },
  deadlineWindowDays: 30,
  urgentMultiplier: 1.5,
  maxItems: 12,
};
