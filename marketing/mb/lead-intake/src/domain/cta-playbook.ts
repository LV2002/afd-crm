import { z } from 'zod';

const KINDS = ['demo-class', 'lead-magnet', 'career-call', 'webinar', 'scholarship-test', 'mock-test', 'cutoff-calculator'] as const;

// What each page's calls to action say, by what the page is about. All of it is data (config/cta-playbook.json): the owner can
// sharpen a headline or change a button without touching code. {exam} becomes the exam the page is about, or "design entrance".
const IntentCopy = z.object({
  headline: z.string().min(5),
  body: z.string().min(10),
  strip: z.string().min(5),
  button: z.string().min(3),
  // The kind of offer that fits this question best; the planner finds the matching offer for the page's exam.
  offerKind: z.enum(KINDS),
});
export type IntentCopy = z.infer<typeof IntentCopy>;

export const CtaPlaybookSchema = z.object({
  intents: z.record(z.string(), IntentCopy),
  // Shown instead of the usual words to someone who has been here before and read about this exam (remembered only in their own browser).
  returning: z.object({ headline: z.string().min(5), body: z.string().min(10), button: z.string().min(3) }),
  inline: z.object({ firstAfterSection: z.number().int().min(1), everyNSections: z.number().int().min(2), max: z.number().int().min(0).max(4) }),
  slideIn: z.object({ enabled: z.boolean(), afterScrollPct: z.number().int().min(20).max(90), afterSeconds: z.number().int().min(5), hideDays: z.number().int().min(1) }),
  // {title} and {exam} are filled in, so the first message a mentor sees already says what the reader was reading.
  whatsappWithExam: z.string().min(10),
  whatsappNoExam: z.string().min(10),
}).refine((p) => p.intents['general'] !== undefined, { message: 'intents needs a "general" entry for pages about no particular question' });
export type CtaPlaybook = z.infer<typeof CtaPlaybookSchema>;
