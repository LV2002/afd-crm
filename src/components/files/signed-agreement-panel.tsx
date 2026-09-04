"use client";

import { CheckCircle2, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeAttachment, uploadAttachment, type UploadState } from "@/lib/storage/actions";
import { ALLOWED_EXTENSIONS, MAX_FILE_BYTES, type AttachmentRow } from "@/lib/storage/shared";

import { OpenFileButton } from "./open-file-button";

const initialState: UploadState = {};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function uploadedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * The one thing a counsellor uploads against a lead: the signed instalment
 * agreement.
 *
 * This replaced a general "attach any file with any label" form. Leon's
 * reasoning was that with the agreement handled properly there is nothing
 * else a counsellor needs to upload here, and a free-form uploader mostly
 * produced files nobody could later find. One purpose, one button, and a
 * plain yes/no at the top of the panel — which is the question anybody
 * opening this section actually has.
 *
 * Documents uploaded before this change are still listed and still open;
 * they are simply read-only now. Removing the uploader must not remove
 * access to what people already put in.
 */
export function SignedAgreementPanel({
  leadId,
  agreement,
  otherFiles,
  canUpload,
  canDelete,
}: {
  leadId: string;
  agreement: AttachmentRow | null;
  otherFiles: AttachmentRow[];
  canUpload: boolean;
  canDelete: boolean;
}) {
  const [uploadResult, uploadAction, uploading] = useActionState(uploadAttachment, initialState);
  const [removeResult, removeAction] = useActionState(removeAttachment, initialState);

  return (
    <div className="flex flex-col gap-4">
      {agreement ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-600/40 bg-emerald-600/5 p-4">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Signed agreement on file</p>
            <p className="truncate text-xs text-muted-foreground">
              {agreement.file_name} · {formatSize(agreement.size_bytes)} · uploaded{" "}
              {uploadedOn(agreement.created_at)}
            </p>
          </div>
          <OpenFileButton attachmentId={agreement.id} variant="outline" />
          {canDelete && (
            <form action={removeAction}>
              <input type="hidden" name="parentKind" value="lead" />
              <input type="hidden" name="parentId" value={leadId} />
              <input type="hidden" name="attachmentId" value={agreement.id} />
              <Button type="submit" variant="ghost" size="sm" aria-label="Remove the signed agreement">
                <Trash2 className="size-4" />
              </Button>
            </form>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No signed agreement uploaded yet. Print the instalment agreement, have it signed, then
          upload a scan or a photo of it here. Accounts can see it as soon as it is up.
        </p>
      )}

      {canUpload && (
        <form action={uploadAction} className="flex flex-col gap-3 rounded-lg border p-4">
          <input type="hidden" name="parentKind" value="lead" />
          <input type="hidden" name="parentId" value={leadId} />
          <input type="hidden" name="kind" value="signed_agreement" />
          <div className="flex flex-col gap-2">
            <Label htmlFor="signed-agreement-file">
              {agreement ? "Replace the signed agreement" : "Upload the signed agreement"}
            </Label>
            <Input
              id="signed-agreement-file"
              name="file"
              type="file"
              accept={ALLOWED_EXTENSIONS}
              required
            />
            <p className="text-xs font-medium text-muted-foreground">
              Maximum file size {MAX_FILE_BYTES / 1024 / 1024} MB · JPG, PNG, WebP, HEIC or PDF
              {agreement ? " · the newest upload is the one accounts sees" : ""}
            </p>
          </div>
          <div>
            <Button type="submit" disabled={uploading} size="sm">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </div>
          {uploadResult.error && <FormMessage error={uploadResult.error} />}
          {uploadResult.success && <FormMessage success={uploadResult.success} />}
        </form>
      )}

      {removeResult.error && <FormMessage error={removeResult.error} />}
      {removeResult.success && <FormMessage success={removeResult.success} />}

      {otherFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Other documents uploaded earlier
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {otherFiles.map((file) => (
              <li key={file.id} className="flex items-center gap-3 p-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.label ?? file.file_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {file.label ? `${file.file_name} · ` : ""}
                    {formatSize(file.size_bytes)} · {uploadedOn(file.created_at)}
                  </p>
                </div>
                <OpenFileButton attachmentId={file.id} />
                {canDelete && (
                  <form action={removeAction}>
                    <input type="hidden" name="parentKind" value="lead" />
                    <input type="hidden" name="parentId" value={leadId} />
                    <input type="hidden" name="attachmentId" value={file.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${file.file_name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
