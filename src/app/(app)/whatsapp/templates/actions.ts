"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getIntegrationCredential, getIntegrationCredentials } from "@/lib/integrations/credentials";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import {
  TEMPLATE_CATEGORIES,
  createMessageTemplate,
  uploadTemplateSample,
  deleteMessageTemplate,
  isValidTemplateName,
  listMessageTemplates,
  type MessageTemplate,
  type TemplateCategory,
} from "@/lib/integrations/whatsapp/templates";
import { createClient } from "@/lib/supabase/server";
import { mediaKindFor } from "@/lib/whatsapp/media";

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

  const urlText = String(formData.get("urlText") ?? "").trim();
  const urlValue = String(formData.get("urlValue") ?? "").trim();
  const callText = String(formData.get("callText") ?? "").trim();
  const callPhone = String(formData.get("callPhone") ?? "").trim();
  if (urlValue && !/^https:\/\/[^\s{}]+$/.test(urlValue)) {
    return { error: "The web address must start with https:// and have no spaces." };
  }
  if ((urlText && !urlValue) || (!urlText && urlValue)) return { error: "A web-page button needs both its words and its address." };
  if (callPhone && !/^\+[1-9]\d{7,14}$/.test(callPhone)) {
    return { error: "Use the full number with country code, like +919847012345." };
  }
  if ((callText && !callPhone) || (!callText && callPhone)) return { error: "A call button needs both its words and a number." };
  if (quickReplies.length + (urlValue ? 1 : 0) + (callPhone ? 1 : 0) > 10) return { error: "Too many buttons." };

  // An image, video or PDF header, instead of a text one. Meta reviews a
  // sample, so the file is uploaded first and the template refers to it.
  const headerFile = formData.get("headerFile");
  const hasHeaderFile = headerFile instanceof File && headerFile.size > 0;
  let headerFormat: "IMAGE" | "VIDEO" | "DOCUMENT" | null = null;
  if (hasHeaderFile) {
    const kind = mediaKindFor(headerFile.type);
    headerFormat = kind === "image" ? "IMAGE" : kind === "video" ? "VIDEO" : kind === "document" && headerFile.type === "application/pdf" ? "DOCUMENT" : null;
    if (!headerFormat) return { error: "A header can be a picture (JPG or PNG), a video (MP4) or a PDF." };
    if (headerFile.size > 4 * 1024 * 1024) return { error: "The sample file must be under 4 MB — use a short clip or a smaller picture." };
  }

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

  let headerMedia: { format: "IMAGE" | "VIDEO" | "DOCUMENT"; handle: string } | undefined;
  if (hasHeaderFile && headerFormat) {
    const appId = await getIntegrationCredential("meta", "app_id");
    if (!appId) {
      return { error: "Picture and video headers need the Meta App ID — an admin adds it in Settings → Integrations → Meta." };
    }
    try {
      headerMedia = { format: headerFormat, handle: await uploadTemplateSample(appId, accessToken, headerFile, headerFile.name) };
    } catch (err) {
      return { error: err instanceof MetaGraphApiError ? `WhatsApp wouldn't take the sample file: ${err.message}` : "Could not reach the WhatsApp Cloud API." };
    }
  }

  let result;
  try {
    result = await createMessageTemplate(wabaId, accessToken, {
      headerMedia,
      name,
      language,
      category,
      body,
      header: header || undefined,
      footer: footer || undefined,
      quickReplies,
      urlButton: urlValue ? { text: urlText, url: urlValue } : undefined,
      callButton: callPhone ? { text: callText, phone: callPhone } : undefined,
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
