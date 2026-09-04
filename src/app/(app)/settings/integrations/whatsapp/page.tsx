import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

import { getWhatsAppConnectionStatus } from "./actions";
import { WhatsAppCredentialsForm } from "./whatsapp-credentials-form";

export default async function WhatsAppIntegrationPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const status = await getWhatsAppConnectionStatus();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          One WhatsApp Business API number for the whole institute, used for marketing and
          broadcasts. Replies to it are matched to the lead they belong to and that lead&apos;s
          counsellor is notified; a reply from a number nobody has entered shows up under
          &quot;Not in the CRM&quot; on the WhatsApp screen rather than becoming a lead of its
          own.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          This is <strong>not</strong> the WhatsApp Business app on anyone&apos;s phone. A number
          is registered to the API or in use by that app, never both — connecting a number here
          ends its use in the app, so use a number kept for the institute, and leave the
          counsellors&apos; own numbers on their phones.
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

    </div>
  );
}
