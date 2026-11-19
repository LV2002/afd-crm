import { z } from 'zod';

// Contact numbers and exam list are configuration, never hard-coded (CLAUDE.md).
export const LeadFormsConfigSchema = z
  .object({
    endpoint: z.string(), // the Apps Script /exec address; empty until the owner deploys it
    centres: z.array(z.object({ id: z.string(), name: z.string(), phone: z.string(), whatsapp: z.string().regex(/^\d{12}$/) })).min(1),
    primaryCentreId: z.string(),
    exams: z.array(z.string()).min(1),
  })
  .refine((c) => c.centres.some((x) => x.id === c.primaryCentreId), { message: 'primaryCentreId is not one of the centres' });

export type LeadFormsConfig = z.infer<typeof LeadFormsConfigSchema>;
