"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { createSignedUrl } from "./attachments";
import {
  ATTACHMENTS_BUCKET,
  buildStoragePath,
  isAttachmentKind,
  SIGNED_AGREEMENT_LABEL,
  validateUpload,
  type AttachmentKind,
  type AttachmentParent,
} from "./shared";

export interface UploadState {
  error?: string;
  success?: string;
}

function parseParent(formData: FormData): AttachmentParent | null {
  const kind = formData.get("parentKind");
  const id = formData.get("parentId");
  if (typeof id !== "string" || id.length === 0) return null;
  if (kind === "lead") return { kind: "lead", id };
  if (kind === "student") return { kind: "student", id };
  return null;
}

/**
 * Upload a file and record it.
 *
 * The permission check here is a UI courtesy, not the security boundary —
 * it only knows whether the caller holds `file.upload` at all, not whether
 * they hold it over *this* lead. The real decision is made twice in
 * Postgres, by the Storage policy on the object and the RLS policy on the
 * row (migration 0031), both of which resolve the owning centre from the
 * parent. That is why this runs on the user's own client and never the
 * service-role one.
 *
 * Order matters: the object is written first, then the row. If the row
 * insert is refused, the just-written object is removed again so a
 * rejected upload cannot leave bytes behind with no record pointing at
 * them — those would be invisible to the app and impossible to clean up
 * from the UI.
 */
export async function uploadAttachment(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "file.upload")) {
    return { error: "You don't have permission to upload files." };
  }

  const parent = parseParent(formData);
  if (!parent) return { error: "Missing or invalid upload target." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file to upload." };

  const invalid = validateUpload(file);
  if (invalid) return { error: invalid };

  // Absent or unrecognised means an ordinary document. A form cannot talk
  // its way into a kind the code does not know about.
  const kindRaw = formData.get("kind");
  const kind: AttachmentKind = isAttachmentKind(kindRaw) ? kindRaw : "document";

  // A signed agreement is only ever a lead's. Attaching one to a student
  // would put it on the wrong side of the accounts→academics handoff, where
  // nobody chasing an instalment would ever look for it.
  if (kind === "signed_agreement" && parent.kind !== "lead") {
    return { error: "A signed agreement belongs on the lead, not the student record." };
  }

  const labelRaw = formData.get("label");
  const label =
    kind === "signed_agreement"
      ? // Named by the system, so the list reads the same however it was
        // uploaded and nobody has to remember the phrasing.
        SIGNED_AGREEMENT_LABEL
      : typeof labelRaw === "string" && labelRaw.trim().length > 0
        ? labelRaw.trim()
        : null;

  const supabase = await createClient();
  const storagePath = buildStoragePath(parent, file.name);

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("attachments")
    .insert({
      [parent.kind === "lead" ? "lead_id" : "student_id"]: parent.id,
      storage_path: storagePath,
      file_name: file.name.slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
      label,
      kind,
      uploaded_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !inserted) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
    return { error: `Could not save the file: ${insertError?.message ?? "unknown error"}` };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "attachment.upload",
    entityType: "attachments",
    entityId: inserted.id,
    after: { parent, fileName: file.name, sizeBytes: file.size, label, kind },
  });

  revalidatePath(parent.kind === "lead" ? `/leads/${parent.id}` : `/students/${parent.id}`);
  // Accounts reads the agreement off their own enrolment screen, whose id
  // this action does not know. Revalidating the segment covers whichever
  // enrolment page is showing this lead's agreement.
  if (kind === "signed_agreement") revalidatePath("/accounts", "layout");
  return { success: `Uploaded ${file.name}.` };
}

/**
 * Removes a file from view. The bytes are deliberately left in Storage:
 * CLAUDE.md § Non-negotiables 5 forbids hard deletes, and a document
 * removed by mistake — a signed agreement, say — has to be recoverable.
 * The row keeps pointing at the object; only `deleted_at` changes.
 */
export async function removeAttachment(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "file.delete")) {
    return { error: "You don't have permission to remove files." };
  }

  const attachmentId = formData.get("attachmentId");
  const parent = parseParent(formData);
  if (typeof attachmentId !== "string" || !parent) return { error: "Missing file reference." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId)
    .is("deleted_at", null)
    .select("id, file_name")
    .maybeSingle<{ id: string; file_name: string }>();

  if (error) return { error: `Could not remove the file: ${error.message}` };
  // No row came back: RLS refused the update. Say so plainly rather than
  // reporting a success that did not happen.
  if (!data) return { error: "That file could not be removed — you may not have access to it." };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "attachment.remove",
    entityType: "attachments",
    entityId: data.id,
    before: { fileName: data.file_name },
  });

  revalidatePath(parent.kind === "lead" ? `/leads/${parent.id}` : `/students/${parent.id}`);
  revalidatePath("/accounts", "layout");
  return { success: `Removed ${data.file_name}.` };
}

/**
 * Mints a short-lived signed URL on demand rather than embedding one in the
 * page. Signed URLs are bearer tokens: rendering them into the list would
 * put a working link to every document into the HTML of anyone who loads
 * the page, and leave them valid in browser history and any copied source.
 * Viewing a file is also a deliberate act worth recording.
 */
export async function getAttachmentUrl(attachmentId: string): Promise<{ url?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "file.read")) return { error: "You don't have permission to view files." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attachments")
    .select("id, storage_path, file_name")
    .eq("id", attachmentId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; storage_path: string; file_name: string }>();

  if (error) return { error: `Could not open the file: ${error.message}` };
  if (!data) return { error: "File not found." };

  const url = await createSignedUrl(supabase, data.storage_path);
  if (!url) return { error: "Could not generate a link for that file." };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "attachment.view",
    entityType: "attachments",
    entityId: data.id,
    after: { fileName: data.file_name },
  });

  return { url };
}
