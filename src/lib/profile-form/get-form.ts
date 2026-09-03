// No `import "server-only"` here, for the same reason as `credentials.ts`:
// that package throws under a plain Node process (tsx, Vitest), and this
// module's tests import it directly. Nothing is weakened — see the note on
// what this function deliberately does not return.
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { fieldDefinitions, leads } from "@/lib/db/schema";
import type { FieldType } from "@/lib/fields/get-field-schema";

/**
 * Reads a lead's student profile form by its per-lead token.
 *
 * Runs on the direct db connection: the student filling it in is
 * anonymous and has no session for RLS to bind to, the same trust
 * boundary as the webhook handlers.
 *
 * What it returns is deliberately narrow. The student's own name is
 * included so the page can greet them and they can tell they have the
 * right form — but nothing else about the lead is exposed: not the phone,
 * not the counsellor, not the stage, not the fee. A leaked link therefore
 * reveals only a first name the holder almost certainly already knows.
 */

export interface ProfileFormField {
  key: string;
  label: string;
  helpText: string | null;
  type: FieldType;
  isRequired: boolean;
  section: string;
  options: Array<{ value: string; label: string }>;
}

export interface ProfileForm {
  leadId: string;
  studentName: string;
  alreadySubmitted: boolean;
  fields: ProfileFormField[];
}

export type ProfileFormLookup =
  | { status: "ok"; form: ProfileForm }
  | { status: "not_found" };

export async function getProfileFormByToken(token: string): Promise<ProfileFormLookup> {
  if (!token || token.length < 16) return { status: "not_found" };

  const [lead] = await db
    .select({
      id: leads.id,
      studentName: leads.studentName,
      submittedAt: leads.profileFormSubmittedAt,
    })
    .from(leads)
    .where(and(eq(leads.profileFormToken, token), isNull(leads.deletedAt)));

  if (!lead) return { status: "not_found" };

  // The STUDENT field definitions — the real AFD intake form seeded from
  // the paper original — not the lead ones. An admin adding a question in
  // Settings → Custom Fields changes this form with no deploy.
  const definitions = await db
    .select({
      key: fieldDefinitions.key,
      label: fieldDefinitions.label,
      helpText: fieldDefinitions.helpText,
      type: fieldDefinitions.type,
      isRequired: fieldDefinitions.isRequired,
      section: fieldDefinitions.section,
      sortOrder: fieldDefinitions.sortOrder,
      options: fieldDefinitions.options,
    })
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.entity, "student"), isNull(fieldDefinitions.deletedAt)))
    .orderBy(fieldDefinitions.sortOrder);

  return {
    status: "ok",
    form: {
      leadId: lead.id,
      studentName: lead.studentName,
      alreadySubmitted: lead.submittedAt !== null,
      fields: definitions.map((d) => ({
        key: d.key,
        label: d.label,
        helpText: d.helpText,
        type: d.type as FieldType,
        isRequired: d.isRequired,
        section: d.section,
        options: d.options ?? [],
      })),
    },
  };
}
