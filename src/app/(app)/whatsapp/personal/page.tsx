import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { whatsappNumbers } from "@/lib/db/schema";

import { WhatsAppInbox, type InboxParams } from "../inbox";

/**
 * **WhatsApp** — the counsellors' own numbers, and the conversations on
 * them.
 *
 * This is the one-to-one channel: a counsellor's handset running the
 * WhatsApp Business app and Meta's Cloud API at the same time
 * (Coexistence), mirrored here. Every reply a counsellor types anywhere
 * in this CRM leaves from the number registered to them — Leon's rule,
 * enforced in `lib/whatsapp/sender-number.ts` rather than by which screen
 * it was typed on.
 *
 * It is the first tab because it is the daily work. The broadcast
 * number's inbox sits last, after Instagram, with the rest of the
 * campaign tooling.
 *
 * ## While no number is connected
 *
 * Coexistence onboarding needs Advanced Access on the WhatsApp
 * permissions, which is still in App Review. Until one is connected this
 * inbox is empty — and says so, with what unlocks it, rather than
 * rendering a blank list and leaving somebody to guess whether it is
 * broken. The explainer that used to be this whole page now lives on the
 * setup screen, where the person who can act on it is.
 */
export default async function PersonalWhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<InboxParams>;
}) {
  const ownNumbers = await db
    .select({ id: whatsappNumbers.id })
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.mode, "coexistence"), isNull(whatsappNumbers.deletedAt)));

  return (
    <WhatsAppInbox
      searchParams={searchParams}
      // Never `includeUnassigned`: a row with no number is a broadcast-era
      // message, and belongs to the other tab.
      scope={{ numberIds: ownNumbers.map((n) => n.id), includeUnassigned: false }}
      basePath="/whatsapp/personal"
      intro={
        <>
          Conversations on the counsellors&apos; own numbers. A message from somebody not yet in
          the CRM <strong>creates a lead</strong> here, assigned to whoever owns the phone —
          the opposite of the broadcast number, and deliberately so. Replies leave from the
          counsellor&apos;s own number; a free-form one only reaches somebody who has messaged
          that number in the last 24 hours.
        </>
      }
      emptyNotice={
        ownNumbers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">No counsellor&apos;s number is connected yet.</p>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              This inbox fills once a counsellor&apos;s own WhatsApp number is onboarded through
              Coexistence, which needs Advanced Access on the WhatsApp permissions — still in App
              Review. Until then their conversations stay on the phone, and replies cannot be
              sent from the CRM: a counsellor&apos;s message never goes out on the institute&apos;s
              broadcast number.{" "}
              <Link href="/settings/integrations/whatsapp" className="font-medium underline">
                Settings → Integrations → WhatsApp
              </Link>{" "}
              has the steps.
            </p>
          </div>
        ) : null
      }
    />
  );
}
