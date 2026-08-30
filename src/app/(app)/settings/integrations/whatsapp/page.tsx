import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

import { getCounsellorsWithWhatsAppAccess, getWhatsAppConnectionStatus } from "./actions";
import { CounsellorNumbersTable } from "./counsellor-numbers-table";
import { WhatsAppCredentialsForm } from "./whatsapp-credentials-form";

export default async function WhatsAppIntegrationPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const [status, counsellors] = await Promise.all([getWhatsAppConnectionStatus(), getCounsellorsWithWhatsAppAccess()]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          One WhatsApp Business number per counsellor: a customer&apos;s conversation shows up
          on the lead&apos;s profile, sendable and readable by whoever owns that number (and by
          centre heads/admins across their scope). One access token below works for every
          number — Meta&apos;s Cloud API lets a single System User act on any number in your
          WhatsApp Business Account.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Webhook URL</h2>
        <p className="max-w-lg text-sm text-muted-foreground">
          Paste this into Meta App Dashboard → WhatsApp → Configuration → Webhook, alongside the
          Verify Token below.
        </p>
        <pre className="w-fit rounded-md bg-muted px-3 py-2 font-mono text-sm">/api/webhooks/whatsapp</pre>
        <p className="text-xs text-muted-foreground">
          Prefix with this CRM&apos;s domain — e.g. <code>https://your-domain.com/api/webhooks/whatsapp</code>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Credentials</h2>
        <WhatsAppCredentialsForm status={status} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Counsellor numbers</h2>
        <p className="max-w-lg text-sm text-muted-foreground">
          Assign each counsellor their own WhatsApp phone number id (from Meta&apos;s WhatsApp
          Manager). A counsellor with no number assigned can&apos;t send until one is set here.
        </p>
        <CounsellorNumbersTable rows={counsellors} />
      </section>
    </div>
  );
}
