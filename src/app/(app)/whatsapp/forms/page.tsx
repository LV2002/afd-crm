import { desc, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappForms } from "@/lib/db/schema";
import { ASK_FIELDS } from "@/lib/whatsapp/flow-engine";

import { FormRowActions, NewFormForm } from "./form-forms";

export const dynamic = "force-dynamic";

export default async function WhatsAppFormsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;
  const forms = await db.select().from(whatsappForms).where(isNull(whatsappForms.deletedAt)).orderBy(desc(whatsappForms.createdAt));
  const choices = Object.entries(ASK_FIELDS).map(([value, meta]) => ({ value, label: meta.label }));

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        A form opens inside WhatsApp, so a student fills in their details without typing them out one reply at a time. Their answers are checked and saved onto
        their lead. Send a form from a chat (Buttons &amp; lists tab) or as a step in an automation. A published form cannot be edited — make a new one.
      </p>
      <NewFormForm fieldChoices={choices} />
      {forms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No forms yet.</p>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-2">
          {forms.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">
                  {f.name}{" "}
                  <Badge variant={f.status === "published" ? "default" : f.status === "error" ? "destructive" : "secondary"}>
                    {f.status === "published" ? "Published" : f.status === "error" ? "Problem" : "Not published"}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">Asks: {f.fields.map((k) => ASK_FIELDS[k as keyof typeof ASK_FIELDS]?.label ?? k).join(", ")}</p>
                {f.lastError && <p className="text-xs text-destructive">{f.lastError}</p>}
              </div>
              <FormRowActions id={f.id} published={f.status === "published"} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
