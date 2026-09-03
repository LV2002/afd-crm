// No `import "server-only"` here, for the same reason as
// `credentials.ts`/`seed-permissions.ts`: that package throws under a plain
// Node process (tsx, Vitest), not just under webpack, and this module's
// tests import it directly. Nothing is weakened by its absence — this
// function reads one row by token and returns form configuration only. It
// never touches lead data, so there is no boundary here for the marker to
// have been guarding.
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { fieldDefinitions, registrationForms } from "@/lib/db/schema";
import type { FieldType } from "@/lib/fields/get-field-schema";

/**
 * Reads a public registration form by its token.
 *
 * Runs on the direct db connection, not an RLS-bound client, for the same
 * reason the webhook handlers do: the visitor is anonymous and has no
 * session for a policy to bind to. The token is the capability, and it
 * grants exactly one thing — the right to render this form and submit it.
 * Nothing here reads or returns anything about existing leads.
 */

export interface PublicFormField {
  key: string;
  label: string;
  helpText: string | null;
  type: FieldType;
  isRequired: boolean;
  isCore: boolean;
  options: Array<{ value: string; label: string }>;
}

export interface PublicForm {
  id: string;
  name: string;
  source: string;
  centerId: string | null;
  introText: string | null;
  successMessage: string | null;
  fields: PublicFormField[];
}

export type FormLookup =
  | { status: "ok"; form: PublicForm }
  | { status: "not_found" }
  | { status: "closed" };

/**
 * A form that exists but is switched off or past its expiry is reported
 * separately from one that never existed, so the page can say "this form
 * is closed" rather than a bare 404 — a real applicant following a stale
 * link deserves to know which of the two happened. The distinction leaks
 * nothing: guessing a token remains the hard part either way.
 */
export async function getPublicForm(token: string): Promise<FormLookup> {
  if (!token || token.length < 16) return { status: "not_found" };

  const [form] = await db
    .select({
      id: registrationForms.id,
      name: registrationForms.name,
      source: registrationForms.source,
      centerId: registrationForms.centerId,
      introText: registrationForms.introText,
      successMessage: registrationForms.successMessage,
      fieldKeys: registrationForms.fieldKeys,
      isActive: registrationForms.isActive,
      expiresAt: registrationForms.expiresAt,
    })
    .from(registrationForms)
    .where(and(eq(registrationForms.token, token), isNull(registrationForms.deletedAt)));

  if (!form) return { status: "not_found" };
  if (!form.isActive) return { status: "closed" };
  if (form.expiresAt && form.expiresAt.getTime() < Date.now()) return { status: "closed" };

  const definitions = await db
    .select({
      key: fieldDefinitions.key,
      label: fieldDefinitions.label,
      helpText: fieldDefinitions.helpText,
      type: fieldDefinitions.type,
      isRequired: fieldDefinitions.isRequired,
      isCore: fieldDefinitions.isCore,
      options: fieldDefinitions.options,
    })
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.entity, "lead"), isNull(fieldDefinitions.deletedAt)));

  const byKey = new Map(definitions.map((d) => [d.key, d]));

  // Ordered by the form's own field_keys, not by the field definitions'
  // sort order: the admin chose this sequence for this form, and a
  // registration form reads as a conversation, so the order is content.
  // A key naming a field that has since been deleted is skipped rather
  // than rendered blank or throwing — the rest of the form still works.
  const fields: PublicFormField[] = [];
  for (const key of form.fieldKeys) {
    const definition = byKey.get(key);
    if (!definition) continue;
    fields.push({
      key: definition.key,
      label: definition.label,
      helpText: definition.helpText,
      type: definition.type as FieldType,
      isRequired: definition.isRequired,
      isCore: definition.isCore,
      options: definition.options ?? [],
    });
  }

  return {
    status: "ok",
    form: {
      id: form.id,
      name: form.name,
      source: form.source,
      centerId: form.centerId,
      introText: form.introText,
      successMessage: form.successMessage,
      fields,
    },
  };
}
