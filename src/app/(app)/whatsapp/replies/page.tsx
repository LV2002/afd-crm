import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { loadLabels, loadSavedReplies } from "@/lib/whatsapp/inbox-tools";
import { createClient } from "@/lib/supabase/server";

import { LabelForm, ReplyForm } from "./replies-forms";

export const dynamic = "force-dynamic";

/** What the team reaches for in the inbox: messages they send often, and the labels they put on conversations. */
export default async function SavedRepliesPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;
  const supabase = await createClient();
  const [replies, labels] = await Promise.all([loadSavedReplies(supabase), loadLabels(supabase)]);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Saved replies</h2>
          <p className="text-sm text-muted-foreground">
            Messages your team sends again and again. In any conversation, type <code>/</code> to pick one (or <code>/fees</code> to jump straight to it).
            Write <code>{"{{name}}"}</code> where their first name should go.
          </p>
        </div>
        {replies.map((r) => <ReplyForm key={r.id} reply={r} />)}
        <ReplyForm />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Labels</h2>
          <p className="text-sm text-muted-foreground">Tags the team puts on a conversation, so you can find all the fee queries or everybody waiting on a demo class.</p>
        </div>
        {labels.map((l) => <LabelForm key={l.id} label={l} />)}
        <LabelForm />
      </section>
    </div>
  );
}
