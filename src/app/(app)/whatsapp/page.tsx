import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappNumbers } from "@/lib/db/schema";

import { WhatsAppInbox, type InboxParams } from "./inbox";

/**
 * **WhatsApp API** — replies to what the institute's broadcast number has
 * sent out.
 *
 * This number is an outbound marketing channel, not a way in. Nothing
 * here creates a lead: an inbound message is matched to a lead that
 * already exists, or filed with none.
 *
 * Nobody replies from this screen's number. A counsellor's answer goes
 * out from their own number (`lib/whatsapp/sender-number.ts`), which is
 * Leon's rule and the reason the conversational inbox is the other tab.
 */
export default async function WhatsAppApiInboxPage({
  searchParams,
}: {
  searchParams: Promise<InboxParams>;
}) {
  // The API tab is for the people who have been given the WhatsApp API.
  // Everybody else lands on their Business Chat — and the Chats entry in the
  // sidebar still points here, so this is where they are sent on.
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) redirect("/whatsapp/personal");

  /*
    Everything that is not a counsellor's own number.

    Expressed as "these ids, plus the rows that name no number at all"
    rather than as a mode test, because the rows written before migration
    0093 carry no number and every one of them arrived here — the API
    number was the only number there was.
  */
  const apiNumbers = await db
    .select({ id: whatsappNumbers.id })
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.mode, "api"), isNull(whatsappNumbers.deletedAt)));

  return (
    <WhatsAppInbox
      searchParams={searchParams}
      scope={{ numberIds: apiNumbers.map((n) => n.id), includeUnassigned: true }}
      basePath="/whatsapp"
      intro={
        <>
          Messages to the institute&apos;s Business API number. A message from somebody who is
          already a lead attaches to that lead and the assigned counsellor is told; one from
          somebody new waits here under <strong>Not in the CRM</strong> until it is made a lead.
          Replies on this tab go out from this same number, inside WhatsApp&apos;s 24-hour window,
          and are sent by whoever runs WhatsApp campaigns. A counsellor&apos;s own conversations
          are on the <strong>WhatsApp Business Chat</strong> tab.
        </>
      }
    />
  );
}
