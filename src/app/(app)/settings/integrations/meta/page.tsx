import { AccessDenied } from "@/components/layout/access-denied";
import { RecentDeliveries } from "@/components/integrations/recent-deliveries";
import { can, getCurrentUser } from "@/lib/auth/session";
import { recentWebhookDeliveries } from "@/lib/integrations/recent-deliveries";
import { createClient } from "@/lib/supabase/server";

import { getMetaConnectionStatus } from "./actions";
import { MetaCredentialsForm } from "./meta-credentials-form";
import { SubscribePageButton } from "./subscribe-page-button";
import { TestConnectionButton } from "./test-connection-button";

export default async function MetaIntegrationPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const deliveries = await recentWebhookDeliveries(await createClient(), "meta_leads");

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

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Page subscription</h2>
        <p className="max-w-lg text-sm text-muted-foreground">
          Meta has two switches for lead delivery. Subscribing the app to the{" "}
          <code>leadgen</code> field in the App Dashboard is the first; this is the second,
          and it tells your Facebook Page to send its leads to this app. With only the first,
          Meta verifies the webhook, reports it as subscribed, and delivers nothing — no
          error anywhere. Press this once the Page Access Token is saved.
        </p>
        <SubscribePageButton />
      </section>

      {/*
        The one question worth asking when leads are not arriving, and
        until now the only place it could be answered was a SQL console.
        Every delivery is written down before it is processed (CLAUDE.md
        non-negotiable #9), so an empty list here is not missing data —
        it is the answer.
      */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Recent deliveries</h2>
        <RecentDeliveries
          deliveries={deliveries}
          emptyHint="Meta has never called this CRM. That means the webhook itself is not set up on the app side — check the Callback URL and Verify Token in App Dashboard → Webhooks → Page, and that the app is subscribed to the leadgen field. The Page subscription above is the other half; both are needed."
        />
      </section>
    </div>
  );
}
