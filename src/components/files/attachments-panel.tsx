"use client";

import { FileText, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
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

/**
 * The general "attach any document" panel, now used by the student record
 * only. The lead page had one too until counsellors were narrowed to the
 * single upload that matters there — see ./signed-agreement-panel.tsx.
 * Academics genuinely do attach several kinds of thing to a student
 * (photo, marksheet, portfolio), so the free-form form still earns its
 * place here.
 */
export function AttachmentsPanel({
  parentKind,
  parentId,
  attachments,
  canUpload,
  canDelete,
  labelSuggestions = [],
}: {
  parentKind: "lead" | "student";
  parentId: string;
  attachments: AttachmentRow[];
  canUpload: boolean;
  canDelete: boolean;
  labelSuggestions?: string[];
}) {
  const [uploadResult, uploadAction, uploading] = useActionState(uploadAttachment, initialState);
  const [removeResult, removeAction] = useActionState(removeAttachment, initialState);

  return (
    <div className="flex flex-col gap-4">
      {canUpload && (
        <form action={uploadAction} className="flex flex-col gap-3 rounded-lg border p-4">
          <input type="hidden" name="parentKind" value={parentKind} />
          <input type="hidden" name="parentId" value={parentId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="file">File</Label>
              <Input id="file" name="file" type="file" accept={ALLOWED_EXTENSIONS} required />
              <p className="text-xs font-medium text-muted-foreground">
                Maximum file size {MAX_FILE_BYTES / 1024 / 1024} MB · JPG, PNG, WebP, HEIC or PDF
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="label">What is it? (optional)</Label>
              <Input id="label" name="label" list="attachment-labels" placeholder="e.g. Signed agreement" />
              <datalist id="attachment-labels">
                {labelSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
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

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {attachments.map((file) => {
            const isImage = file.mime_type.startsWith("image/");
            return (
              <li key={file.id} className="flex items-center gap-3 p-3">
                {isImage ? (
                  <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.label ?? file.file_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {file.label ? `${file.file_name} · ` : ""}
                    {formatSize(file.size_bytes)} ·{" "}
                    {new Date(file.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Kolkata",
                    })}
                  </p>
                </div>
                <OpenFileButton attachmentId={file.id} />
                {canDelete && (
                  <form action={removeAction}>
                    <input type="hidden" name="parentKind" value={parentKind} />
                    <input type="hidden" name="parentId" value={parentId} />
                    <input type="hidden" name="attachmentId" value={file.id} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${file.file_name}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
