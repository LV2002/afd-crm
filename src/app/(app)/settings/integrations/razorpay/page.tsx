import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { hasIntegrationCredential } from "@/lib/integrations/credentials";

import { RazorpayCredentialsForm } from "./credentials-form";

export default async function RazorpayIntegrationPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;
  const stored = {
    key_id: await hasIntegrationCredential("razorpay", "key_id"),
    key_secret: await hasIntegrationCredential("razorpay", "key_secret"),
    webhook_secret: await hasIntegrationCredential("razorpay", "webhook_secret"),
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Razorpay</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Lets accounts send a payment link inside a WhatsApp chat. A link is only a request for money: when it is paid, accounts is told and records the payment
          the usual way — the ledger is never written to automatically.
        </p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Webhook</h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          In the Razorpay dashboard → Settings → Webhooks, add this URL with a secret of your choosing, tick <em>payment_link.paid</em>, <em>payment_link.expired</em> and{" "}
          <em>payment_link.cancelled</em>, and paste the same secret below.
        </p>
        <pre className="w-fit rounded-md bg-muted px-3 py-2 font-mono text-sm">/api/webhooks/razorpay</pre>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Keys</h2>
        <p className="text-xs text-muted-foreground">Use rzp_test_ keys first to try it without real money.</p>
        <RazorpayCredentialsForm stored={stored} />
      </section>
    </div>
  );
}
