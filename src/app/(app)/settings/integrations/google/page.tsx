import { AccessDenied } from "@/components/layout/access-denied";
import { ImportAdSpend } from "@/components/integrations/import-ad-spend";
import { RecentDeliveries } from "@/components/integrations/recent-deliveries";
import { can, getCurrentUser } from "@/lib/auth/session";
import { adSpendHistory } from "@/lib/integrations/ad-spend-history";
import { recentWebhookDeliveries } from "@/lib/integrations/recent-deliveries";
import { createClient } from "@/lib/supabase/server";

import { getGoogleConnectionStatus, importPastGoogleAdSpend } from "./actions";
import { GoogleCredentialsForm } from "./google-credentials-form";
import { TestConnectionButton } from "./test-connection-button";

/** A ninety-day spend import runs as a server action inside this route segment — see the Meta page's note. */
export const maxDuration = 60;

export default async function GoogleIntegrationPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const deliveries = await recentWebhookDeliveries(await createClient(), "google_leads");

  const status = await getGoogleConnectionStatus();
  const spend = await adSpendHistory("google");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Google</h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          Connects Google Ads Lead Form ingestion (a lead lands in the CRM the moment someone
          submits your Search or Display lead form), the nightly ad spend sync (for
          cost-per-lead and ROAS reporting), and the daily retargeting sync (every consenting
          lead kept up to date in a Google Ads Customer Match list — added when eligible,
          removed the moment consent is withdrawn or they&apos;re marked do-not-contact).
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Webhook URL</h2>
        <p className="max-w-lg text-sm text-muted-foreground">
          Paste this into Google Ads → Leads → Lead form assets → webhook delivery, alongside
          the Webhook Verify Key below.
        </p>
        <pre className="w-fit rounded-md bg-muted px-3 py-2 font-mono text-sm">/api/webhooks/google-leads</pre>
        <p className="text-xs text-muted-foreground">
          Prefix with this CRM&apos;s domain — e.g. <code>https://your-domain.com/api/webhooks/google-leads</code>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Credentials</h2>
        <GoogleCredentialsForm status={status} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Connection</h2>
        <TestConnectionButton />
      </section>

      {/* Same as Meta's: the nightly sync keeps today right, this is for the history that predates the CRM. */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Ad spend history</h2>
        <ImportAdSpend history={spend} action={importPastGoogleAdSpend} platformName="Google Ads" />
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
          emptyHint="Google has never called this CRM. Check the Webhook URL and Key in Google Ads → the lead form asset → Lead delivery option, and press Send test data there."
        />
      </section>
    </div>
  );
}
