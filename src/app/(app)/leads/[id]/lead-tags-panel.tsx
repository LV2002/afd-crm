"use client";

import { X } from "lucide-react";
import { useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";

import { addLeadTag, removeLeadTag } from "./actions";

export interface TagOption {
  id: string;
  name: string;
  color: string | null;
}

export function LeadTagsPanel({
  leadId,
  currentTags,
  availableTags,
  canEdit,
}: {
  leadId: string;
  currentTags: TagOption[];
  availableTags: TagOption[];
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (currentTags.length === 0 && !canEdit) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {currentTags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          style={{ borderColor: tag.color ?? undefined }}
          className="gap-1"
        >
          {tag.name}
          {canEdit && (
            <button
              type="button"
              aria-label={`Remove ${tag.name} tag`}
              disabled={isPending}
              onClick={() => startTransition(() => removeLeadTag(leadId, tag.id))}
            >
              <X className="size-3" />
            </button>
          )}
        </Badge>
      ))}
      {canEdit && availableTags.length > 0 && (
        // Keyed on the available list so a successful add/remove (which
        // revalidates the page and hands back a new, shorter/longer list)
        // remounts this uncontrolled Select back to its placeholder,
        // instead of it holding on to the just-picked value.
        <Combobox
          key={availableTags.map((t) => t.id).join(",")}
          className="w-auto"
          size="sm"
          disabled={isPending}
          value=""
          onChange={(tagId) => startTransition(() => addLeadTag(leadId, tagId))}
          options={availableTags.map((tag) => ({ value: tag.id, label: tag.name }))}
          placeholder="+ Add tag"
          searchPlaceholder="Type a tag…"
        />
      )}
    </div>
  );
}
