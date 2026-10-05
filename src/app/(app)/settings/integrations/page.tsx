import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { hasIntegrationCredential, integrationEncryptionStatus } from "@/lib/integrations/credentials";
import { DEFAULT_RETARGETING_WINDOW_DAYS } from "@/lib/integrations/audience-sync";
import { createClient } from "@/lib/supabase/server";

import { RetargetingForm } from "./retargeting-form";

interface IntegrationCard {
  href: string | null;
  name: string;
  description: string;
  connected: boolean;
}

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const encryption = integrationEncryptionStatus();

  const metaConnected = await hasIntegrationCredential("meta", "page_access_token");
  const googleConnected = await hasIntegrationCredential("google", "refresh_token");
  const whatsappConnected = await hasIntegrationCredential("whatsapp", "access_token");
  const websiteConnected = await hasIntegrationCredential("website", "signing_secret");

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("org_settings")
    .select("retargeting_window_days")
    .limit(1)
    .maybeSingle<{ retargeting_window_days: number }>();
  const retargetingWindowDays = org?.retargeting_window_days ?? DEFAULT_RETARGETING_WINDOW_DAYS;

  const { count } = await supabase
    .from("custom_webhooks")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .is("deleted_at", null);
  // Null when the count could not be read at all, which for this card
  // means "say nothing about how many" rather than "say zero".
  const customWebhookCount = count ?? 0;

  const cards: IntegrationCard[] = [
    {
      href: "/settings/integrations/meta",
      name: "Meta",
      description: "Lead Ads ingestion + daily ad spend sync.",
      connected: metaConnected,
    },
    {
      href: "/settings/integrations/google",
      name: "Google",
      description: "Lead form ingestion + daily ad spend sync + Customer Match retargeting.",
      connected: googleConnected,
    },
    {
      href: "/settings/integrations/whatsapp",
      name: "WhatsApp",
      description: "Per-counsellor chat on the lead profile, sent and received from the CRM.",
      connected: whatsappConnected,
    },
    {
      href: "/settings/integrations/website",
      name: "Website forms",
      description: "Enquiries from afdindia.com, straight into the pipeline instead of a spreadsheet.",
      connected: websiteConnected,
    },
    {
      href: "/settings/integrations/webhooks",
      name: "Custom webhooks",
      // The count rather than a Connected badge: "connected" means
      // nothing here, because the answer is however many endpoints the
      // institute has made.
      description:
        customWebhookCount === 0
          ? "An endpoint for any service that can post JSON — a course platform, a form builder, a landing page."
          : `${customWebhookCount} endpoint${customWebhookCount === 1 ? "" : "s"}, each with its own URL and source name.`,
      connected: customWebhookCount > 0,
    },
    { href: null, name: "Telephony", description: "Click-to-call and call logging. Coming soon.", connected: false },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect an external platform by entering its credentials here — no deploy needed.
        </p>
      </div>

      {/*
        Said before anybody types a secret, not after they press Save.
        Every credential is encrypted with a key that lives in the deploy
        environment. When it is missing the encrypt call throws — and an
        admin who had just entered six Meta tokens lost the whole screen
        to it, with nothing beforehand to suggest the form could not work.
      */}
      {!encryption.ready && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-[0.9375rem]">
            <strong>Credentials cannot be saved yet.</strong> {encryption.reason}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Set <code>INTEGRATION_ENCRYPTION_KEY</code> in the hosting environment
            (Vercel → Settings → Environment Variables) and redeploy. Generate one with{" "}
            <code>openssl rand -base64 32</code>. It is the key everything else is encrypted
            under, so it cannot itself live in the database — this is the one setting that
            genuinely needs a deploy.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => {
          const content = (
            <div className="flex h-full flex-col gap-2 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{card.name}</h2>
                {card.href && (
                  <Badge variant={card.connected ? "default" : "secondary"}>
                    {card.connected ? "Connected" : "Not connected"}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{card.description}</p>
            </div>
          );
          return card.href ? (
            <Link key={card.name} href={card.href} className="hover:opacity-80">
              {content}
            </Link>
          ) : (
            <div key={card.name} className="opacity-60">
              {content}
            </div>
          );
        })}
      </div>

      {/*
        Explained here rather than only in a doc, because "how does the
        retargeting work" is a question asked while looking at this
        screen, and the honest answer has a consent rule in it that
        matters more than the setting does.
      */}
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <div>
          <h2 className="font-medium">Retargeting audiences</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Once a night the CRM sends your leads&apos; phone numbers — hashed, never in the
            clear — to Meta as a Custom Audience and to Google as a Customer Match list. Those
            platforms match them against their own users, and your ads can then be aimed at
            exactly the people who have already enquired with you, or at the lookalike
            audiences built from them. The CRM does not show the ads; it keeps the list of who
            should see them accurate.
          </p>
        </div>

        <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>It is a two-way sync, not a growing list.</strong> Each night the CRM works
            out who is eligible and compares that with who it last uploaded. Somebody new is
            added; somebody who withdrew consent, was marked do-not-contact, or dropped out of
            the window below is <em>removed</em> from the live audience.
          </li>
          <li>
            <strong>Only leads who consented.</strong> A lead with no recorded consent is
            excluded rather than assumed willing — including every lead imported before consent
            was being recorded. Enquiring is the consent; opting out withdraws it, permanently.
          </li>
          <li>
            <strong>A match is never guaranteed.</strong> Meta and Google only match a number to
            an account they already hold, so an audience is always smaller than the list sent —
            and both platforms refuse to run an audience below roughly a thousand matched
            people. A new instance will see &quot;audience too small&quot; on the Meta side for
            a while; that is their floor, not a fault here.
          </li>
          <li>
            <strong>Nothing happens until the audience is used.</strong> The CRM keeps the list
            up to date. Pointing a campaign at it — or at a lookalike of it, or excluding it
            from a prospecting campaign so you stop paying twice for the same person — is done
            in Meta Ads Manager and Google Ads.
          </li>
        </ul>

        <RetargetingForm windowDays={retargetingWindowDays} />
      </section>
    </div>
  );
}
