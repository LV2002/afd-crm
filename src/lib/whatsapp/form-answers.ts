import "server-only";

import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

import { cleanFormAnswers } from "./flow-form";
import { writeLeadAnswers } from "./lead-answers";

/**
 * Files a submitted WhatsApp form's answers on the lead. Each answer is
 * checked like a typed one; what fails its check is left out and named in
 * the audit entry, so a bad email never overwrites a good one.
 */
export async function fileFormAnswers(leadId: string, raw: Record<string, unknown>): Promise<void> {
  const { values, rejected } = cleanFormAnswers(raw);
  if (Object.keys(values).length === 0 && rejected.length === 0) return;
  await writeLeadAnswers(leadId, values);
  await db.insert(auditLog).values({
    actorId: null,
    action: "whatsapp.form_submitted",
    entityType: "leads",
    entityId: leadId,
    after: { filed: Object.keys(values), rejected },
  });
}
