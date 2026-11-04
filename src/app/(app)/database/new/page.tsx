import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { contactFields } from "@/lib/contacts/fields";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { OPTION_BEARING_TYPES, resolveFieldOptions } from "@/lib/fields/resolve-field-options";
import { createClient } from "@/lib/supabase/server";

import { addContact } from "../actions";
import { ContactForm } from "../contact-form";

export default async function NewContactPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const [schema, { data: lists }] = await Promise.all([
    getFieldSchema(supabase, "lead", user),
    supabase.from("contact_lists").select("id, name").is("archived_at", null).order("name").returns<Array<{ id: string; name: string }>>(),
  ]);
  const fields = contactFields(schema);
  const optionsByKey = Object.fromEntries(
    await Promise.all(
      fields.filter((f) => OPTION_BEARING_TYPES.has(f.type)).map(async (f) => [f.key, await resolveFieldOptions(supabase, f)] as const),
    ),
  );

  if (!lists || lists.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Every contact belongs to a list.{" "}
        <Link href="/database/lists" className="font-medium underline">
          Create a list first
        </Link>
        , for example &ldquo;St Xavier&rsquo;s seminar, Nov 2026&rdquo;.
      </p>
    );
  }

  return (
    <ContactForm
      action={addContact}
      fields={fields}
      optionsByKey={optionsByKey}
      defaults={{}}
      lists={lists}
      submitLabel="Add to the database"
    />
  );
}
