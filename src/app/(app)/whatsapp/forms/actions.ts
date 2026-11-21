"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappForms } from "@/lib/db/schema";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import { createAndPublishFlow } from "@/lib/integrations/whatsapp/client";
import { buildFlowJson, isFormFieldList, MAX_FORM_FIELDS } from "@/lib/whatsapp/flow-form";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  success?: string;
}

async function campaigner() {
  const user = await getCurrentUser();
  return user && can(user, "whatsapp.campaign") ? user : null;
}

export async function createForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await campaigner();
  if (!user) return { error: "You don't have permission to do that." };

  const name = String(formData.get("name") ?? "").trim();
  const introText = String(formData.get("introText") ?? "").trim();
  const buttonLabel = String(formData.get("buttonLabel") ?? "").trim() || "Fill the form";
  const fields = formData.getAll("fields").map(String);
  if (!name) return { error: "Give the form a name." };
  if (!introText) return { error: "Write the message that comes with the form." };
  if (introText.length > 1024) return { error: "Keep the message under 1024 characters." };
  if (buttonLabel.length > 20) return { error: "The button can be 20 characters at most." };
  if (!isFormFieldList(fields)) return { error: "Pick at least one thing to ask." };
  if (fields.length > MAX_FORM_FIELDS) return { error: `A form can ask for ${MAX_FORM_FIELDS} things at most.` };

  const [created] = await db
    .insert(whatsappForms)
    .values({ name, introText, buttonLabel, fields, createdBy: user.id })
    .returning({ id: whatsappForms.id });

  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action: "whatsapp.form_create", entityType: "whatsapp_forms", entityId: created.id, after: { name, fields } });
  revalidatePath("/whatsapp/forms");
  return { success: "Saved. Publish it to WhatsApp to start using it." };
}

/**
 * Builds the form's JSON from its fields, creates it on Meta and publishes
 * it. A published form cannot be changed — make a new one instead.
 */
export async function publishForm(formId: string): Promise<FormState> {
  const user = await campaigner();
  if (!user) return { error: "You don't have permission to do that." };

  const [form] = await db
    .select()
    .from(whatsappForms)
    .where(and(eq(whatsappForms.id, formId), isNull(whatsappForms.deletedAt)));
  if (!form) return { error: "That form no longer exists." };
  if (form.status === "published") return { error: "Already published." };
  if (!isFormFieldList(form.fields)) return { error: "This form has no valid fields." };

  const { access_token: accessToken, waba_id: wabaId } = await getIntegrationCredentials("whatsapp", ["access_token", "waba_id"]);
  if (!accessToken || !wabaId) {
    return { error: "WhatsApp isn't fully connected — an admin needs the access token and Business Account ID in Settings → Integrations → WhatsApp." };
  }

  try {
    const created = await createAndPublishFlow(wabaId, accessToken, {
      name: form.name,
      flowJson: buildFlowJson({ title: form.name, fields: form.fields, submitLabel: "Submit" }),
    });
    if (created.validationErrors.length > 0) {
      const message = created.validationErrors.join("; ");
      await db.update(whatsappForms).set({ status: "error", lastError: message, metaFlowId: created.id, updatedAt: new Date() }).where(eq(whatsappForms.id, formId));
      revalidatePath("/whatsapp/forms");
      return { error: `WhatsApp found problems with the form: ${message}` };
    }
    await db.update(whatsappForms).set({ status: "published", metaFlowId: created.id, lastError: null, updatedAt: new Date() }).where(eq(whatsappForms.id, formId));
  } catch (err) {
    const message = err instanceof MetaGraphApiError ? err.message : "Could not reach WhatsApp.";
    await db.update(whatsappForms).set({ status: "error", lastError: message, updatedAt: new Date() }).where(eq(whatsappForms.id, formId));
    revalidatePath("/whatsapp/forms");
    return { error: `WhatsApp wouldn't accept it: ${message}` };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action: "whatsapp.form_publish", entityType: "whatsapp_forms", entityId: formId });
  revalidatePath("/whatsapp/forms");
  return { success: "Published. You can now send it from a chat or an automation." };
}

export async function deleteForm(formId: string): Promise<FormState> {
  const user = await campaigner();
  if (!user) return { error: "You don't have permission to do that." };
  await db.update(whatsappForms).set({ deletedAt: new Date() }).where(eq(whatsappForms.id, formId));
  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action: "whatsapp.form_delete", entityType: "whatsapp_forms", entityId: formId });
  revalidatePath("/whatsapp/forms");
  return { success: "Removed." };
}
