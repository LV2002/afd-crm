import { NextResponse } from "next/server";

import { can, getCurrentUser } from "@/lib/auth/session";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import {
  OPTION_BEARING_TYPES,
  resolveFieldOptions,
  type FieldOption,
} from "@/lib/fields/resolve-field-options";
import { buildImportTemplate, importTemplateFileName } from "@/lib/leads/import-template";
import { importableFields } from "@/lib/leads/importable-fields";
import { reportingFailures } from "@/lib/errors/capture";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * A starter CSV, with this instance's own columns and one worked row.
 *
 * Generated rather than committed, because the importer's targets come
 * from `field_definitions` — a static file would be wrong the first time
 * somebody adds a custom field, and would mislead exactly the person
 * doing a one-off bulk import with no way to know it was stale.
 *
 * Gated on `lead.import` rather than `lead.read`: the column list is a
 * map of what this CRM stores about a person, and the sample row names
 * real option values. Not a secret, but not something to hand to
 * everybody who can read a lead either.
 */
async function run(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(user, "lead.import")) {
    return NextResponse.json({ error: "You don't have permission to import." }, { status: 403 });
  }

  const supabase = await createClient();
  const schema = await getFieldSchema(supabase, "lead", user);

  // Only for the fields that can carry options, and only the ones the
  // template will actually print — resolving every field's options would
  // query dropdowns nothing shows.
  const optionsByKey: Record<string, FieldOption[]> = {};
  await Promise.all(
    importableFields(schema)
      .filter((field) => OPTION_BEARING_TYPES.has(field.type))
      .map(async (field) => {
        optionsByKey[field.key] = await resolveFieldOptions(supabase, field);
      }),
  );

  const csv = buildImportTemplate({ fields: schema, optionsByKey });

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${importTemplateFileName()}"`,
      "cache-control": "no-store",
    },
  });
}

export async function GET() {
  return reportingFailures("leads:import-template", run);
}
