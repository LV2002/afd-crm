import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

import { getMetaConnectionStatus } from "./actions";
import { MetaCredentialsForm } from "./meta-credentials-form";
import { TestConnectionButton } from "./test-connection-button";

export default async function MetaIntegrationPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const status = await getMetaConnectionStatus();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Meta</h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          Connects Meta Lead Ads (a lead lands in the CRM the moment someone submits your form),
          the nightly ad spend sync (for cost-per-lead and ROAS reporting), and the daily
          retargeting sync (every consenting lead kept up to date in a Meta Custom Audience —
          added when eligible, removed the moment consent is withdrawn or they&apos;re marked
          do-not-contact).
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Webhook URL</h2>
        <p className="max-w-lg text-sm text-muted-foreground">
          Paste this into Meta App Dashboard → Webhooks → Page → Subscribe, alongside the Verify
          Token below.
        </p>
        <pre className="w-fit rounded-md bg-muted px-3 py-2 font-mono text-sm">/api/webhooks/meta-leads</pre>
        <p className="text-xs text-muted-foreground">
          Prefix with this CRM&apos;s domain — e.g. <code>https://your-domain.com/api/webhooks/meta-leads</code>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Credentials</h2>
        <MetaCredentialsForm status={status} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Connection</h2>
        <TestConnectionButton />
      </section>
    </div>
  );
}
