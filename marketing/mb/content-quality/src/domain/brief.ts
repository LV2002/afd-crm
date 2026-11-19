import { z } from 'zod';

const answer = z.string().min(5);

// Set on a local page (India, Kerala or a district). It says what the page must offer that its sibling pages cannot.
export const GeoBriefSchema = z.object({
  key: z.string(),
  titleHint: z.string(),
  tier: z.enum(['india', 'kerala', 'district']),
  place: z.string(),
  path: z.string(),
  angle: z.string(),
  neighbours: z.array(z.string()),
  centres: z.array(z.object({ name: z.string(), district: z.string(), relation: z.enum(['here', 'next-door', 'further']) })),
  // The fact carrying the official list of exam centres in Kerala, which a local page must use.
  examCentreFactId: z.string().optional(),
  // The fact saying we also teach online, which every local page must use.
  onlineFactId: z.string().optional(),
  noNearbyCentre: z.boolean().default(false),
  links: z.array(z.object({ title: z.string(), path: z.string() })),
  parentPath: z.string().optional(),
});
export type GeoBrief = z.infer<typeof GeoBriefSchema>;

// Set on a planned page that is not a local page: an exam guide, a comparison, a college page, a page for students outside Kerala, or an answer
// to one real search. It carries what the page must stand on, so the writer and the checks both hold it to that.
export const PlanBriefSchema = z.object({
  key: z.string(),
  kind: z.enum(['hub', 'comparison', 'college', 'region', 'question']),
  titleHint: z.string(),
  path: z.string(),
  angle: z.string(),
  exams: z.array(z.string()),
  requiredFactIds: z.array(z.string()),
  optionalFactIds: z.array(z.string()),
  onlineFactId: z.string().optional(),
  links: z.array(z.object({ title: z.string(), path: z.string() })),
  parentPath: z.string().optional(),
  query: z.string().optional(),
});
export type PlanBrief = z.infer<typeof PlanBriefSchema>;

// Set on a rework driven by the research: what is holding the page back, the searches to work in, and whether its title and main heading are to be left as they are.
export const OptimiseBriefSchema = z.object({
  keepTitle: z.boolean(),
  addSearches: z.array(z.string()),
  issues: z.array(z.object({ text: z.string(), fix: z.string() })),
  potentialClicks: z.number(),
});
export type OptimiseBrief = z.infer<typeof OptimiseBriefSchema>;

// The five reader answers shape the draft and are never published.
export const BriefSchema = z.object({
  primaryKeyword: z.string().min(2),
  secondaryKeywords: z.array(z.string().min(2)).default([]),
  searchIntent: z.enum(['informational', 'commercial', 'transactional', 'navigational']),
  contentGoal: z.enum(['awareness', 'education', 'consideration', 'conversion', 'retention', 'authority', 'news', 'local']),
  funnelStage: z.enum(['top', 'middle', 'bottom']),
  audience: z.string().min(3),
  cta: z.object({ text: z.string().min(3), url: z.string().optional() }),
  readerAnswers: z.object({ who: answer, outcome: answer, whyUs: answer, proof: answer, nextStep: answer }),
  geo: GeoBriefSchema.optional(),
  plan: PlanBriefSchema.optional(),
  optimise: OptimiseBriefSchema.optional(),
});
export type Brief = z.infer<typeof BriefSchema>;

export interface Draft {
  readonly seoTitle: string;
  readonly metaDescription: string;
  readonly slug: string;
  // Markdown. Dates, fees and results appear only as {{fact:<id>}} tokens.
  readonly body: string;
  readonly brief: Brief;
}
