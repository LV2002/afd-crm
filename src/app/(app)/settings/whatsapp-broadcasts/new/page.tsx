import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { NewBroadcastForm } from "./new-broadcast-form";

interface TagRow {
  id: string;
  name: string;
}

export default async function NewWhatsAppBroadcastPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const supabase = await createClient();
  const { data: tags } = await supabase
    .from("tags")
    .select("id, name")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name")
    .returns<TagRow[]>();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">New WhatsApp Broadcast</h1>
        <p className="text-sm text-muted-foreground">
          Sends a pre-approved template — a broadcast reaches leads outside their individual
          24-hour reply window, so only a template message is accepted here.
        </p>
      </div>
      <NewBroadcastForm tags={tags ?? []} />
    </div>
  );
}
