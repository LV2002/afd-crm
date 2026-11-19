import { z } from 'zod';

// The most that paid data (rank tracking, keyword data, AI answer checks) may cost in one India-time month.
// 0 means paid data is switched off: nothing is called until the owner sets a number.
export const BudgetConfigSchema = z.object({ monthlyCapUsd: z.number().min(0).max(10_000) });
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;
