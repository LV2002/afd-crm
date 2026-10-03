import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

/**
 * Counsellors' own WhatsApp — deliberately not built, and this page says
 * why rather than leaving a gap somebody fills with an unofficial library.
 *
 * There is no official API for a personal or WhatsApp Business *app*
 * account. Every tool that offers one (whatsapp-web.js, Baileys, and the
 * services built on them) drives WhatsApp Web through a reverse-engineered
 * protocol, which breaks WhatsApp's terms. The number is what gets
 * punished, the ban is permanent, and there is no appeal — and the numbers
 * in question are the lines AFD's counsellors answer enquiries on.
 *
 * So the page presents the three real options and lets Leon choose, rather
 * than quietly shipping the risk inside a feature he asked for.
 */
export default async function PersonalWhatsAppPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.read")) return <AccessDenied />;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="rounded-lg border border-warning/40 bg-warning-subtle p-4">
        <p className="text-[0.9375rem]">
          <strong>This one cannot be built safely, and it is worth knowing why.</strong>{" "}
          WhatsApp has no official API for a personal or Business-app account. Reading a
          counsellor&apos;s own chats means driving WhatsApp Web through a reverse-engineered
          library, which breaks WhatsApp&apos;s terms.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          What gets punished is the number, the ban is permanent, and there is no appeal.
          Those are the lines your counsellors answer enquiries on — a ban costs the
          conversations in progress, not just the integration.
        </p>
      </div>

      <div>
        <h2 className="font-medium">What can be done instead</h2>
        <ul className="mt-2 flex list-disc flex-col gap-3 pl-5 text-sm">
          <li>
            <strong>A Business API number per counsellor.</strong> Fully supported, no ban
            risk, and every conversation lands in the Inbox next to the lead it belongs to.
            Each number carries a cost and has to be registered, and a counsellor cannot
            keep using the WhatsApp app on that number afterwards.
          </li>
          <li>
            <strong>One shared Business API number, with the conversation assigned.</strong>{" "}
            Already how the Inbox works today — a reply is matched to its lead and the
            assigned counsellor is told. Costs nothing more. Students see the institute
            rather than a person.
          </li>
          <li>
            <strong>Leave personal WhatsApp where it is.</strong> Counsellors keep using
            their own phones, and log what matters against the lead. Nothing is at risk, and
            nothing is captured automatically.
          </li>
        </ul>
      </div>

      <p className="text-sm text-muted-foreground">
        Instagram is a different matter — Meta does publish an API for it, and that tab is
        a real build rather than a refusal.
      </p>
    </div>
  );
}
