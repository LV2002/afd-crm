import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import {
  OPTION_BEARING_TYPES,
  resolveFieldOptions,
  type FieldOption,
} from "@/lib/fields/resolve-field-options";
import {
  templateBody,
  templateHeaderMediaKind,
  templatePlaceholderCount,
} from "@/lib/integrations/whatsapp/templates";
import { audienceFields, type AudienceEntity } from "@/lib/whatsapp/audience";
import { createClient } from "@/lib/supabase/server";

import { listTemplates } from "../../templates/actions";
import { NewBroadcastForm, type AudienceFieldOptions } from "./new-broadcast-form";

interface TagRow {
  id: string;
  name: string;
}

/**
 * Composing a broadcast: pick who, pick what, see the count, send.
 *
 * The audience controls are built from `field_definitions` for both
 * leads and students, so the same filters exist here as on Insights and a
 * custom field an admin adds becomes a targeting option immediately.
 * Both entities' fields are loaded up front so switching between them is
 * instant rather than a round trip.
 */
export default async function NewWhatsAppBroadcastPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const supabase = await createClient();

  async function optionsFor(entity: AudienceEntity): Promise<AudienceFieldOptions[]> {
    const fields = await audienceFields(supabase, user!, entity);
    const schema = await getFieldSchema(supabase, entity, user!);
    return Promise.all(
      fields.map(async (field) => {
        let options: FieldOption[] = [];
        if (field.type === "boolean") {
          options = [
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ];
        } else if (OPTION_BEARING_TYPES.has(field.type)) {
          const definition = schema.find((entry) => entry.key === field.key);
          if (definition) options = await resolveFieldOptions(supabase, definition);
        }
        return { field, options };
      }),
    );
  }

  const [leadFields, studentFields, { data: tags }, templateResult] = await Promise.all([
    optionsFor("lead"),
    optionsFor("student"),
    supabase
      .from("tags")
      .select("id, name")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name")
      .returns<TagRow[]>(),
    listTemplates(),
  ]);

  // Only approved templates can actually be sent, so only approved ones
  // are offered. Anything else in the list would be a send that fails at
  // Meta's door with the counsellor none the wiser about why.
  const templates =
    templateResult.status === "ok"
      ? templateResult.templates
          .filter((template) => template.status === "APPROVED")
          .map((template) => ({
            name: template.name,
            language: template.language,
            body: templateBody(template),
            placeholders: templatePlaceholderCount(template),
            // Decides whether the form offers a file at all: Meta rejects
            // a media header on a text-header template, and rejects a send
            // that omits one on a media-header template.
            headerMediaKind: templateHeaderMediaKind(template),
          }))
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">New broadcast</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Sends a pre-approved template. A broadcast reaches people outside their individual
          24-hour reply window, which is the only thing WhatsApp accepts a template for — and the
          only thing it accepts out there.
        </p>
      </div>

      {templates.length === 0 && (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No approved templates yet.{" "}
          <Link href="/whatsapp/templates" className="font-medium underline">
            Create one
          </Link>{" "}
          and Meta will review it — usually within minutes.
        </div>
      )}

      <NewBroadcastForm
        leadFields={leadFields}
        studentFields={studentFields}
        tags={tags ?? []}
        templates={templates}
      />
    </div>
  );
}
