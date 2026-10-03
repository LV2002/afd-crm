import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

/**
 * Instagram DMs — not built yet, and unlike personal WhatsApp there is
 * nothing stopping it.
 *
 * Meta publishes the Instagram Messaging API for Professional accounts
 * linked to a Facebook Page, which AFD already has. The work is real
 * (another webhook, another client, another inbox view, another App
 * Review permission) and the shape is the same as the WhatsApp inbox, so
 * this page says what it needs rather than pretending to be empty.
 */
export default async function InstagramPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.read")) return <AccessDenied />;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="rounded-lg border p-4">
        <p className="text-[0.9375rem]">
          <strong>Not connected yet — and nothing is in the way.</strong> Meta publishes the
          Instagram Messaging API for Professional accounts linked to a Facebook Page, which
          <span> </span>
          <code>afdindia</code> already is. This is a build, not a blocker.
        </p>
      </div>

      <div>
        <h2 className="font-medium">What it needs</h2>
        <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>
            The Instagram account set to <strong>Professional</strong> and linked to the AFD
            Facebook Page, with <strong>Connected tools → Allow access to messages</strong>{" "}
            turned on.
          </li>
          <li>
            <code>instagram_manage_messages</code> added to the same Meta app, through the
            same App Review as the lead-ads permissions.
          </li>
          <li>
            A webhook for the <code>messages</code> field — the same verify-persist-process
            path the WhatsApp and Meta Lead Ads webhooks already use.
          </li>
          <li>
            Matching a DM to a lead. An Instagram handle is not a phone number, so this needs
            a decision: match on handle where a lead already has one, and otherwise treat the
            conversation as unmatched, exactly as the WhatsApp inbox treats a reply from an
            unknown number.
          </li>
        </ol>
      </div>

      <p className="text-sm text-muted-foreground">
        Worth doing after the Meta lead-ads App Review is in, since it rides the same
        submission and the same app.
      </p>
    </div>
  );
}
