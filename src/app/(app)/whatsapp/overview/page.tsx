import { count, eq } from "drizzle-orm";
import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappFlows, whatsappMessages, whatsappSavedReplies } from "@/lib/db/schema";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { fetchPhoneNumberHealth, type PhoneNumberHealth } from "@/lib/integrations/whatsapp/client";
import { describeQuality, describeTier } from "@/lib/whatsapp/click-to-chat";

import { listTemplates } from "../templates/actions";
import { ChatLinkBuilder } from "./chat-link";

export const dynamic = "force-dynamic";

const TONE: Record<"good" | "warn" | "bad" | "unknown", string> = {
  good: "text-green-700 dark:text-green-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-destructive",
  unknown: "text-muted-foreground",
};

/** One home for WhatsApp: is it set up, is the number healthy, and the shortcuts people ask for. */
export default async function WhatsAppOverviewPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const { access_token: accessToken, phone_number_id: phoneNumberId } = await getIntegrationCredentials("whatsapp", ["access_token", "phone_number_id"]);
  const connected = Boolean(accessToken && phoneNumberId);

  let health: PhoneNumberHealth | null = null;
  let healthError: string | null = null;
  if (connected) {
    try {
      health = await fetchPhoneNumberHealth(phoneNumberId!, accessToken!);
    } catch (error) {
      healthError = error instanceof Error ? error.message : "Could not reach WhatsApp.";
    }
  }

  const [templateResult, [{ n: activeFlows }], [{ n: replies }], [{ n: inbound }]] = await Promise.all([
    listTemplates(),
    db.select({ n: count() }).from(whatsappFlows).where(eq(whatsappFlows.isActive, true)),
    db.select({ n: count() }).from(whatsappSavedReplies),
    db.select({ n: count() }).from(whatsappMessages).where(eq(whatsappMessages.direction, "inbound")),
  ]);
  const approved = templateResult.status === "ok" ? templateResult.templates.filter((t) => t.status === "APPROVED").length : 0;

  const steps = [
    { done: connected, label: "Connect your WhatsApp number", href: "/settings/integrations", hint: "An admin does this once, in Settings → Integrations." },
    { done: approved > 0, label: "Have an approved message template", href: "/whatsapp/templates", hint: "Templates are the only messages you can start a chat with." },
    { done: inbound > 0, label: "Receive a first reply", href: "/whatsapp/api", hint: "Send yourself a message to check replies arrive in the inbox." },
    { done: replies > 0, label: "Save a few quick replies", href: "/whatsapp/replies", hint: "Fees, timings, address — one tap instead of retyping." },
    { done: activeFlows > 0, label: "Switch on an automation", href: "/whatsapp/flows", hint: "A welcome message and follow-ups that run themselves." },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const quality = describeQuality(health?.qualityRating ?? null);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Getting set up · {doneCount} of {steps.length} done</h2>
        <ul className="flex flex-col gap-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2 text-sm">
              {s.done ? <CheckCircle2 className="mt-0.5 size-4 text-green-600" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" />}
              <div>
                <Link href={s.href} className={s.done ? "text-muted-foreground line-through" : "font-medium underline-offset-2 hover:underline"}>{s.label}</Link>
                {!s.done && <p className="text-xs text-muted-foreground">{s.hint}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Your number&rsquo;s health</h2>
        {!connected ? (
          <p className="text-sm text-muted-foreground">Connect WhatsApp first.</p>
        ) : health ? (
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">Number</dt>
            <dd>{health.displayPhoneNumber ?? "—"}{health.verifiedName ? ` · ${health.verifiedName}` : ""}</dd>
            <dt className="text-muted-foreground">Quality</dt>
            <dd className={TONE[quality.tone]}>{quality.label}</dd>
            <dt className="text-muted-foreground">Daily limit</dt>
            <dd>{describeTier(health.messagingLimitTier)}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{health.status ?? "—"}</dd>
          </dl>
        ) : (
          <p className="text-sm text-destructive">Couldn&rsquo;t read the number&rsquo;s health: {healthError}</p>
        )}
        <p className="text-xs text-muted-foreground">If the quality drops, people are blocking or reporting your messages. Slow down broadcasts and only message people who asked to hear from you.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Chat link &amp; QR code</h2>
        <ChatLinkBuilder defaultPhone={health?.displayPhoneNumber?.replace(/\D/g, "") ?? ""} />
      </section>
    </div>
  );
}
