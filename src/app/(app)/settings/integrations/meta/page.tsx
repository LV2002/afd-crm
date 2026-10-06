import { AccessDenied } from "@/components/layout/access-denied";
import { ImportAdSpend } from "@/components/integrations/import-ad-spend";
import { RecentDeliveries } from "@/components/integrations/recent-deliveries";
import { can, getCurrentUser } from "@/lib/auth/session";
import { adSpendHistory } from "@/lib/integrations/ad-spend-history";
import { recentWebhookDeliveries } from "@/lib/integrations/recent-deliveries";
import { createClient } from "@/lib/supabase/server";

import { getMetaConnectionStatus, importPastMetaAdSpend } from "./actions";
import { MetaCredentialsForm } from "./meta-credentials-form";
import { SubscribePageButton } from "./subscribe-page-button";
import { TestConnectionButton } from "./test-connection-button";
import { TestInstagramButton } from "./test-instagram-button";

/**
 * A ninety-day spend import is one paginated API call plus a few hundred
 * upserts, which is comfortably more than a server action's default
 * allowance and comfortably less than a minute. Raised here because a
 * server action runs inside the route segment it was called from.
 */
export const maxDuration = 60;

export default async function MetaIntegrationPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const deliveries = await recentWebhookDeliveries(supabase, "meta_leads");
  const instagramDeliveries = await recentWebhookDeliveries(supabase, "instagram");

  const status = await getMetaConnectionStatus();
  const spend = await adSpendHistory("meta");

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
        <TestInstagramButton />
      </section>

      {/*
        The nightly sync keeps today's numbers right. This is for the
        history that existed before the CRM did — and it is a button
        rather than a documented curl command because the alternative
        means handing somebody a secret and a terminal to run a report.
      */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Ad spend history</h2>
        <ImportAdSpend history={spend} action={importPastMetaAdSpend} platformName="Meta" />
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
        <p className="max-w-lg text-sm text-muted-foreground">
          It subscribes the Page to <code>leadgen</code> and <code>messages</code> together,
          because Instagram DMs are delivered on the second one and Meta&apos;s call replaces the
          set rather than adding to it. Press it again after linking the Instagram account, and
          it will say whether <code>messages</code> took.
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

      {/*
        Instagram DMs ride the same app, the same App Secret and the same
        Verify Token — a second callback URL on the same Meta app, for the
        `instagram` object rather than `page`. So it belongs on this
        screen rather than in an integration of its own, with its own
        delivery panel because "are DMs arriving?" and "are leads
        arriving?" are different questions with different answers.
      */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Instagram DMs</h2>
        <p className="max-w-lg text-sm text-muted-foreground">
          Callback URL <code>/api/webhooks/instagram</code>, subscribed to the{" "}
          <code>messages</code> field of the <strong>Instagram</strong> object — the same App
          Secret and Verify Token as above. It also needs{" "}
          <code>instagram_manage_messages</code> through App Review, the Instagram account set
          to Professional and linked to the Page, and{" "}
          <em>Connected tools → Allow access to messages</em> turned on in the Instagram app.
          Replies are sent with the Page Access Token and the Instagram Account ID above.
        </p>
        <p className="max-w-lg text-sm text-muted-foreground">
          Then press <strong>Subscribe Page</strong> above once more. The Instagram account hangs
          off the Facebook Page, and the Page has to be subscribed to <code>messages</code> for
          anything to be delivered — the exact shape of the <code>leadgen</code> trap, one field
          along.
        </p>
        <RecentDeliveries
          deliveries={instagramDeliveries}
          emptyHint="No Instagram event has ever reached this CRM. Either the webhook is not subscribed to the Instagram object's messages field, or the account has not granted message access. Nothing arrives, and nothing fails, until both are done."
        />
      </section>
    </div>
  );
}
