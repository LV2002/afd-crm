import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { contactFields } from "@/lib/contacts/fields";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { createClient } from "@/lib/supabase/server";

import { ImportWizard } from "./import-wizard";

export default async function ImportContactsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const [schema, { data: lists }] = await Promise.all([
    getFieldSchema(supabase, "lead", user),
    supabase.from("contact_lists").select("id, name").is("archived_at", null).order("name").returns<Array<{ id: string; name: string }>>(),
  ]);

  if (!lists || lists.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Every file goes into a list.{" "}
        <Link href="/database/lists" className="font-medium underline">
          Create a list first
        </Link>
        , for example the name of the school or the database you bought.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Upload a CSV. Anyone already in the database is added to this list rather than duplicated, and their blank details
        are filled in; nothing already stored is overwritten. People already in your leads are recognised and shown as such.
        The file is read in your browser and is not kept.
      </p>
      <ImportWizard fields={contactFields(schema)} lists={lists} />
    </div>
  );
}
