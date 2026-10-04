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
        <h2 className="font-medium">How it will work</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Decided deliberately, and differently from WhatsApp: a DM does{" "}
          <strong>not</strong> create a lead. Most Instagram messages are questions, replies
          to a story, or nothing at all, and a CRM that turns every one of them into a lead
          stops being a record of who is actually enrolling. So this is a conversation
          first.
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>Every DM arrives here and can be replied to from the CRM.</li>
          <li>
            <strong>Convert to lead</strong> is a button on the conversation, pressed by the
            counsellor when it turns into a real enquiry.
          </li>
          <li>
            Converting goes through the same path as every other source
            (<code>resolveOrCreateLead</code>), so a person who already exists is linked
            rather than duplicated, and the assignment rules apply as usual.
          </li>
          <li>
            An Instagram handle is not a phone number, so a conversation stays matched by
            handle until the counsellor adds one.
          </li>
        </ul>
      </div>

      <div>
        <h2 className="font-medium">What it needs from Meta</h2>
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
        </ol>
      </div>

      <p className="text-sm text-muted-foreground">
        Worth submitting alongside the lead-ads permissions, since it rides the same review
        and the same app.
      </p>
    </div>
  );
}
