import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

import { WhatsAppNav } from "./whatsapp-nav";

/**
 * The WhatsApp Business API section.
 *
 * One heading and one tab strip for every screen underneath, so the
 * inbox and the template manager read as one product rather than two
 * pages that happen to mention WhatsApp. Gated once here on
 * `whatsapp.read`; the tabs that need more say so themselves.
 */
export default async function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.read")) return <AccessDenied />;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The institute&apos;s WhatsApp Business API number. Not the WhatsApp Business app on
          anyone&apos;s phone — a number belongs to one or the other, never both.
        </p>
      </div>
      <WhatsAppNav canCampaign={can(user, "whatsapp.campaign")} />
      {children}
    </div>
  );
}
