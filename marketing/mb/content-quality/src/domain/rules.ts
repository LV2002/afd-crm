import { z } from 'zod';

// Editable lists live in config/copy-rules.json, not in code.
export const CopyRulesSchema = z.object({
  bannedPhrases: z.array(z.string().min(1)),
  stockOpeners: z.array(z.string().min(1)),
  // Topics we never write about (fees and prices). Whole words only, so "coffee" and "offer" are fine.
  bannedWords: z.array(z.string().min(1)),
  bannedSymbols: z.array(z.string().min(1)),
});
export type CopyRules = z.infer<typeof CopyRulesSchema>;
