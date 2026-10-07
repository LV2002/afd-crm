import { and, eq, isNull } from "drizzle-orm";

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
          Replies to what the institute&apos;s broadcast number has sent out. Nothing here
          creates a lead — a reply is matched to a lead you already have, and the assigned
          counsellor is told. Answering happens on the <strong>WhatsApp</strong> tab, from the
          counsellor&apos;s own number, never from this one.
        </>
      }
    />
  );
}
