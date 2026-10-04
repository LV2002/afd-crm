import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

/**
 * Counsellors' own WhatsApp.
 *
 * Two things people reach for here, and a third that actually works.
 *
 * **An unofficial library** (whatsapp-web.js, Baileys) drives WhatsApp Web
 * through a reverse-engineered protocol. It breaks WhatsApp's terms, and
 * what gets banned is the number a counsellor answers enquiries on.
 *
 * **An iframe of web.whatsapp.com** cannot render at all: WhatsApp sends
 * `X-Frame-Options`, and the browser refuses to display the page inside
 * another site. Nothing in this application can override a header another
 * domain sends — that is the whole point of it. Stripping it would mean
 * proxying WhatsApp Web through our own server, which is the
 * reverse-engineering problem again wearing a different hat.
 *
 * **Coexistence** is the real answer, and Meta shipped it in May 2025: one
 * number running the WhatsApp Business app AND the Cloud API at the same
 * time. The counsellor keeps their phone and their number; the CRM sees
 * and sends on it officially. That is this feature, supported.
 */
export default async function PersonalWhatsAppPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.read")) return <AccessDenied />;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="rounded-lg border border-success/40 bg-success-subtle p-4">
        <p className="text-[0.9375rem]">
          <strong>There is a supported way to do this, called Coexistence.</strong> One number
          runs the WhatsApp Business app and Meta&apos;s Cloud API at the same time. The
          counsellor keeps their phone, their number and their chats; the CRM sees and sends
          on that number officially, through the same webhook the institute&apos;s number
          already uses.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Meta shipped it in May 2025. No ban risk, no reverse engineering, and nothing for a
          counsellor to change about how they work day to day.
        </p>
      </div>

      <div>
        <h2 className="font-medium">What Coexistence gives you, and what it does not</h2>
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>Messages sent or received on either side mirror to the other in real time.</li>
          <li>
            On approval, up to <strong>180 days</strong> of one-to-one history syncs across.
            Anything older stays in the app only.
          </li>
          <li>
            <strong>Group chats do not sync</strong>, disappearing messages and live location
            are turned off, and broadcast lists become read-only.
          </li>
          <li>
            It applies to the <strong>WhatsApp Business app</strong>, not consumer WhatsApp. A
            counsellor on the ordinary app would move to the free Business one, same number.
          </li>
        </ul>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="font-medium">Why not just embed WhatsApp Web in a frame</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          It cannot render. WhatsApp sends an <code>X-Frame-Options</code> header and the
          browser refuses to display the page inside another site — a protection against
          exactly the kind of framing that lets one site read another&apos;s session. Nothing
          in this CRM can override a header a different domain sends. Routing it through our
          own server to strip that header would mean proxying WhatsApp Web, which is the
          reverse-engineering problem again under another name.
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="font-medium">One thing to decide before switching it on</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Supervisors being able to read a counsellor&apos;s conversations is reasonable for
          work on a business number and is not reasonable for someone&apos;s private messages.
          Coexistence keeps that line in the right place — it syncs the business number&apos;s
          one-to-one chats and not group chats — but the counsellors should be told plainly
          that admissions conversations on that number are visible to their centre head, in
          the same way a shared inbox is.
        </p>
      </div>
    </div>
  );
}
