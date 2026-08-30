import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { updateTag } from "../actions";
import { TagForm } from "../tag-form";
import { ActiveToggle } from "./active-toggle";

interface TagRow {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
}

export default async function EditTagPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const { id } = await params;
  const supabase = await createClient();

  const { data: tag } = await supabase
    .from("tags")
    .select("id, name, color, is_active")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<TagRow>();

  if (!tag) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{tag.name}</h1>
          <Badge variant={tag.is_active ? "default" : "secondary"}>{tag.is_active ? "Active" : "Inactive"}</Badge>
        </div>
        <ActiveToggle tagId={tag.id} isActive={tag.is_active} />
      </div>

      <TagForm
        values={{ name: tag.name, color: tag.color ?? "" }}
        action={updateTag.bind(null, tag.id)}
        submitLabel="Save changes"
      />
    </div>
  );
}
