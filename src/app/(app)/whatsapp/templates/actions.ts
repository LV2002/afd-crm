"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import {
  TEMPLATE_CATEGORIES,
  createMessageTemplate,
  deleteMessageTemplate,
  isValidTemplateName,
  listMessageTemplates,
  type MessageTemplate,
  type TemplateCategory,
} from "@/lib/integrations/whatsapp/templates";
import { createClient } from "@/lib/supabase/server";

export interface TemplateFormState {
  error?: string;
  success?: string;
}

export type TemplateListResult =
  | { status: "ok"; templates: MessageTemplate[] }
  | { status: "not_connected" }
  | { status: "error"; message: string };

/**
 * Templates are read live from Meta on every page load rather than
 * mirrored into our database. Meta owns the approval state and changes it
 * without telling us — a template approved overnight, or paused later for
 * poor feedback — so a local copy would be confidently wrong.
 */
export async function listTemplates(): Promise<TemplateListResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) {
    return { status: "error", message: "You don't have permission to manage templates." };
  }

  const { access_token: accessToken, waba_id: wabaId } = await getIntegrationCredentials(
    "whatsapp",
    ["access_token", "waba_id"],
  );
  if (!accessToken || !wabaId) return { status: "not_connected" };

  try {
    return { status: "ok", templates: await listMessageTemplates(wabaId, accessToken) };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof MetaGraphApiError
          ? `WhatsApp rejected the request: ${err.message}`
          : "Could not reach the WhatsApp Cloud API.",
    };
  }
}

function isCategory(value: unknown): value is TemplateCategory {
  return typeof value === "string" && (TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Submits a new template to Meta for approval. It comes back PENDING and
 * becomes sendable only once Meta approves it — usually minutes, but it
 * is their decision and there is no way to hurry it.
 */
export async function submitTemplate(
  _prevState: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) {
    return { error: "You don't have permission to create templates." };
  }

  const name = String(formData.get("name") ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const language = String(formData.get("language") ?? "").trim() || "en";
  const category = formData.get("category");
  const body = String(formData.get("body") ?? "").trim();
  const header = String(formData.get("header") ?? "").trim();
  const footer = String(formData.get("footer") ?? "").trim();
  const quickReplies = [1, 2, 3]
    .map((i) => String(formData.get(`quickReply${i}`) ?? "").trim())
    .filter(Boolean);

  if (!isValidTemplateName(name)) {
    return { error: "The name may only contain lowercase letters, digits and underscores." };
  }
  if (!isCategory(category)) return { error: "Pick a category." };
  if (!body) return { error: "The message body can't be empty." };

  const { access_token: accessToken, waba_id: wabaId } = await getIntegrationCredentials(
    "whatsapp",
    ["access_token", "waba_id"],
  );
  if (!accessToken || !wabaId) {
    return {
      error:
        "WhatsApp isn't fully connected — an admin needs to set the access token and the WhatsApp Business Account ID in Settings → Integrations → WhatsApp.",
    };
  }

  let result;
  try {
    result = await createMessageTemplate(wabaId, accessToken, {
      name,
      language,
      category,
      body,
      header: header || undefined,
      footer: footer || undefined,
      quickReplies,
    });
  } catch (err) {
    // Meta's own message is the useful one here — it names the rule that
    // was broken (a duplicate name, a placeholder that doesn't start at
    // {{1}}, a body ending on a variable) far better than we could guess.
    return {
      error:
        err instanceof MetaGraphApiError
          ? `WhatsApp wouldn't accept it: ${err.message}`
          : "Could not reach the WhatsApp Cloud API.",
    };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.template_create",
    entityType: "integration_credentials",
    after: { name, language, category, status: result.status },
  });

  revalidatePath("/whatsapp/templates");
  return {
    success: `Submitted "${name}" for approval. It becomes sendable once Meta approves it — usually within minutes.`,
  };
}

export async function removeTemplate(name: string): Promise<TemplateFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) {
    return { error: "You don't have permission to delete templates." };
  }

  const { access_token: accessToken, waba_id: wabaId } = await getIntegrationCredentials(
    "whatsapp",
    ["access_token", "waba_id"],
  );
  if (!accessToken || !wabaId) return { error: "WhatsApp isn't connected." };

  try {
    await deleteMessageTemplate(wabaId, accessToken, name);
  } catch (err) {
    return {
      error:
        err instanceof MetaGraphApiError
          ? `WhatsApp rejected the request: ${err.message}`
          : "Could not reach the WhatsApp Cloud API.",
    };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.template_delete",
    entityType: "integration_credentials",
    before: { name },
  });

  revalidatePath("/whatsapp/templates");
  return { success: `Deleted "${name}".` };
}
