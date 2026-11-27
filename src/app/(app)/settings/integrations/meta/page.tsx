import { AccessDenied } from "@/components/layout/access-denied";
import { ImportAdSpend } from "@/components/integrations/import-ad-spend";
import { RecentDeliveries } from "@/components/integrations/recent-deliveries";
import { can, getCurrentUser } from "@/lib/auth/session";
import { asc, desc, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contactLists, metaLeadFilters } from "@/lib/db/schema";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { adSpendHistory } from "@/lib/integrations/ad-spend-history";
import { recentWebhookDeliveries } from "@/lib/integrations/recent-deliveries";
import { createClient } from "@/lib/supabase/server";

import { getMetaConnectionStatus, importPastMetaAdSpend } from "./actions";
import { LeadFilters } from "./lead-filters";
import { MetaCredentialsForm } from "./meta-credentials-form";
import { SubscribePageButton } from "./subscribe-page-button";
import { TestConnectionButton } from "./test-connection-button";

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

  const status = await getMetaConnectionStatus();
  const spend = await adSpendHistory("meta");

  // Campaigns, ad sets and forms switched off for the CRM, and the campaigns
  // leads have recently come from (offered as one-click choices).
  const rules = await db
    .select()
    .from(metaLeadFilters)
    .where(isNull(metaLeadFilters.deletedAt))
    .orderBy(desc(metaLeadFilters.createdAt));
  const listRows = await db
    .select({ id: contactLists.id, name: contactLists.name })
    .from(contactLists)
    .where(isNull(contactLists.archivedAt))
    .orderBy(asc(contactLists.name));
  const listNameById = new Map(listRows.map((l) => [l.id, l.name]));
  const blockedCampaigns = new Set(rules.filter((r) => r.kind === "campaign").map((r) => r.externalId));
  const recent = [
    ...(await db.execute<{ campaign_id: string; leads: number }>(sql`
      select campaign_id, count(*)::int as leads
      from enquiries
      where source = 'meta' and campaign_id ~ '^[0-9]{5,25}$' and created_at > now() - interval '60 days'
      group by campaign_id
      order by max(created_at) desc
      limit 12`)),
  ].filter((r) => !blockedCampaigns.has(r.campaign_id));
  const { ads_access_token: adsToken } = await getIntegrationCredentials("meta", ["ads_access_token"]);
  const names = new Map<string, string>();
  if (adsToken) {
    await Promise.allSettled(
      recent.map(async (r) => {
        const url = new URL(`https://graph.facebook.com/v21.0/${r.campaign_id}`);
        url.searchParams.set("fields", "name");
        url.searchParams.set("access_token", adsToken);
        const response = await fetch(url.toString(), { signal: AbortSignal.timeout(3000) });
        if (response.ok) names.set(r.campaign_id, ((await response.json()) as { name?: string }).name ?? "");
      }),
    );
  }
  const seen = recent.map((r) => ({ campaignId: r.campaign_id, name: names.get(r.campaign_id) || null, leads: r.leads }));

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
        <h2 className="font-medium">Campaigns that stay out of the CRM</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          A lead form on some campaigns does not need to land in the CRM. Choose a campaign, ad set or lead form here and its new leads either stay out of
          the CRM completely, or are added to a database you choose instead (someone already on any database is skipped).
          Either way they never become leads. Leads already in the CRM stay; you can
          delete them from Leads. The ID is the number Meta shows for the campaign, ad set or form in Ads Manager.
        </p>
        <LeadFilters
          rules={rules.map((r) => ({
            id: r.id,
            kind: r.kind,
            externalId: r.externalId,
            label: r.label,
            destination: r.destination,
            listName: r.contactListId ? (listNameById.get(r.contactListId) ?? null) : null,
          }))}
          lists={listRows}
          seen={seen}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Credentials</h2>
        <MetaCredentialsForm status={status} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Connection</h2>
        <TestConnectionButton />
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
          It subscribes the Page to <code>leadgen</code> only. This CRM does not receive Instagram
          or Messenger messages, and pressing it also removes the <code>messages</code>{" "}
          subscription from a Page that had one.
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
