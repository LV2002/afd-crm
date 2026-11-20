import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappAutoReplies } from "@/lib/db/schema";

import { AutoReplyForm } from "./auto-reply-form";

export const dynamic = "force-dynamic";

export default async function AutoRepliesPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;
  const rows = await db.select().from(whatsappAutoReplies);
  const get = (kind: "greeting" | "away") => rows.find((r) => r.kind === kind);
  const greeting = get("greeting");
  const away = get("away");

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Automatic replies on the institute&rsquo;s number. If both apply, the &ldquo;we&rsquo;re closed&rdquo; message is sent instead of the greeting.
        Nobody gets the same one twice in a row.
      </p>
      <AutoReplyForm
        kind="greeting"
        title="Greeting"
        help="Sent when somebody writes to you after at least a day of silence."
        enabled={greeting?.enabled ?? false}
        message={greeting?.message ?? ""}
        days={[1, 2, 3, 4, 5, 6]}
        opensAt="09:00"
        closesAt="18:00"
      />
      <AutoReplyForm
        kind="away"
        title="We're closed"
        help="Sent when somebody writes outside your opening hours. At most once every 12 hours per person."
        enabled={away?.enabled ?? false}
        message={away?.message ?? ""}
        days={away?.days ?? [1, 2, 3, 4, 5, 6]}
        opensAt={away?.opensAt ?? "09:00"}
        closesAt={away?.closesAt ?? "18:00"}
      />
    </div>
  );
}
