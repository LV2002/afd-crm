import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";

import { WhatsAppNav } from "./whatsapp-nav";

/**
 * The Chats section — one place for every conversation channel.
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
        <h1 className="text-2xl font-semibold">Chats</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every WhatsApp conversation with a student. <strong>WhatsApp Business Chat</strong> is
          the counsellors&apos; own numbers; <strong>WhatsApp API</strong> is the institute&apos;s
          broadcast number, with its templates, broadcasts and automations, and is only shown to
          people who have been given access to it.
        </p>
      </div>
      <WhatsAppNav canCampaign={can(user, "whatsapp.campaign")} />
      {children}
    </div>
  );
}
