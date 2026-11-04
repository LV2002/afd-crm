import Link from "next/link";
import { notFound } from "next/navigation";

import { can, getCurrentUser } from "@/lib/auth/session";
import { contactFields } from "@/lib/contacts/fields";
import { leadStateFor } from "@/lib/contacts/lead-matches";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { OPTION_BEARING_TYPES, resolveFieldOptions } from "@/lib/fields/resolve-field-options";
import { createClient } from "@/lib/supabase/server";

import { updateContact } from "../actions";
import { ContactForm } from "../contact-form";
import { ContactActions } from "./contact-actions";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const user = (await getCurrentUser())!;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name, phone, email, fields, lead_id, linked_how, contact_list_members(list_id)")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      fields: Record<string, unknown> | null;
      lead_id: string | null;
      linked_how: string | null;
      contact_list_members: Array<{ list_id: string }>;
    }>();
  if (!contact) notFound();

  const [{ data: lists }, schema, state] = await Promise.all([
    supabase.from("contact_lists").select("id, name").returns<Array<{ id: string; name: string }>>(),
    getFieldSchema(supabase, "lead", user),
    leadStateFor([{ id: contact.id, phone: contact.phone, email: contact.email, leadId: contact.lead_id }]),
  ]);
  const listName = new Map((lists ?? []).map((l) => [l.id, l.name]));
  const fields = contactFields(schema);
  const optionsByKey = Object.fromEntries(
    await Promise.all(
      fields.filter((f) => OPTION_BEARING_TYPES.has(f.type)).map(async (f) => [f.key, await resolveFieldOptions(supabase, f)] as const),
    ),
  );
  const s = state.get(contact.id);
  const canManage = can(user, "contact.manage");

  const defaults = {
    ...(contact.fields ?? {}),
    student_name: contact.name,
    primary_phone: contact.phone,
    email: contact.email,
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/database" className="text-sm text-muted-foreground underline">
          ← Back to the database
        </Link>
        <h2 className="text-xl font-semibold">{contact.name}</h2>
        <p className="text-sm text-muted-foreground">
          On: {contact.contact_list_members.map((m) => listName.get(m.list_id)).filter(Boolean).join(", ") || "no list"}
        </p>
      </div>

      <ContactActions
        contactId={contact.id}
        hasPhone={Boolean(contact.phone)}
        linked={s?.linked ? { leadId: s.linked.leadId, leadNumber: s.linked.leadNumber, how: contact.linked_how } : null}
        match={s?.match ? { leadId: s.match.leadId, leadNumber: s.match.leadNumber, counsellor: s.match.counsellorName } : null}
        canPromote={can(user, "contact.promote") && can(user, "lead.create")}
        canManage={canManage}
      />

      {canManage ? (
        <ContactForm
          action={updateContact}
          fields={fields}
          optionsByKey={optionsByKey}
          defaults={defaults}
          contactId={contact.id}
          submitLabel="Save changes"
        />
      ) : (
        <p className="text-sm text-muted-foreground">You can see this contact but not edit it.</p>
      )}
    </div>
  );
}
