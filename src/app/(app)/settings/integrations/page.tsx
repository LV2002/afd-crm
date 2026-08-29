import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { hasIntegrationCredential } from "@/lib/integrations/credentials";

interface IntegrationCard {
  href: string | null;
  name: string;
  description: string;
  connected: boolean;
}

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const metaConnected = await hasIntegrationCredential("meta", "page_access_token");
  const googleConnected = await hasIntegrationCredential("google", "refresh_token");

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
    { href: null, name: "WhatsApp", description: "Per-counsellor chat and marketing broadcasts. Coming soon.", connected: false },
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
    </div>
  );
}
