"use client";

import { Download, FileText, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAttachmentUrl, removeAttachment, uploadAttachment, type UploadState } from "@/lib/storage/actions";
import { ALLOWED_EXTENSIONS, MAX_FILE_BYTES, type AttachmentRow } from "@/lib/storage/shared";

const initialState: UploadState = {};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Shared by the lead detail page and the student profile — the two differ
 * only in which parent id they pass, and file access is decided by that
 * parent in Postgres either way, so one component serves both.
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
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /**
   * The signed URL is fetched on click rather than rendered into the list.
   * It is a bearer token with a short life; putting one in the markup for
   * every file would hand a working link to each document to anyone who
   * views source, and leave them in history.
   */
  function open(attachmentId: string) {
    setOpenError(null);
    setOpening(attachmentId);
    startTransition(async () => {
      const result = await getAttachmentUrl(attachmentId);
      setOpening(null);
      if (result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else {
        setOpenError(result.error ?? "Could not open that file.");
      }
    });
  }

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
              <p className="text-xs text-muted-foreground">
                Images or PDF, up to {MAX_FILE_BYTES / 1024 / 1024} MB.
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
      {openError && <FormMessage error={openError} />}

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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => open(file.id)}
                  disabled={opening === file.id}
                >
                  {opening === file.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Open
                </Button>
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
