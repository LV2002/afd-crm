import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";

import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { profiles, whatsappNumbers } from "@/lib/db/schema";

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
 * number's inbox sits last, with the rest of the
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
  const user = await getCurrentUser();
  const allOwn = await db
    .select({
      id: whatsappNumbers.id,
      label: whatsappNumbers.label,
      counsellorId: whatsappNumbers.counsellorId,
      counsellorName: profiles.fullName,
      displayPhoneNumber: whatsappNumbers.displayPhoneNumber,
    })
    .from(whatsappNumbers)
    .leftJoin(profiles, eq(profiles.id, whatsappNumbers.counsellorId))
    .where(and(eq(whatsappNumbers.mode, "coexistence"), isNull(whatsappNumbers.deletedAt)))
    .orderBy(whatsappNumbers.label);

  /*
    One counsellor's chats at a time, like each person's own WhatsApp.

    A counsellor sees only their own number. Somebody who may read other
    people's chats (a campaign manager, a centre head, an admin) first picks
    whose chats to open — never a pile of everybody's conversations merged
    into one list, which is unreadable and was the complaint.
  */
  const seesOthers = Boolean(user && (can(user, "whatsapp.campaign") || (scopeFor(user, "whatsapp.read") ?? "own") !== "own"));
  const candidates = seesOthers ? allOwn : allOwn.filter((n) => n.counsellorId === user?.id);
  const { number: numberParam } = await searchParams;
  const chosen = candidates.find((n) => n.id === numberParam) ?? (candidates.length === 1 ? candidates[0] : null);
  const ownNumbers = chosen ? [chosen] : [];

  if (!chosen && candidates.length > 1) {
    return (
      <div className="flex flex-col gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Each counsellor&apos;s chats are kept apart, like their own WhatsApp. Choose whose conversations to open.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((n) => (
            <Link key={n.id} href={`/whatsapp/personal?number=${n.id}`} className="flex items-center gap-3 rounded-lg border p-4 hover:bg-accent/40">
              <span className="flex size-10 items-center justify-center rounded-full bg-[#25d366] text-lg font-semibold text-white">
                {(n.counsellorName ?? n.label).charAt(0).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{n.counsellorName ?? n.label}</span>
                <span className="truncate text-xs text-muted-foreground">{n.displayPhoneNumber ?? n.label}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <WhatsAppInbox
      searchParams={searchParams}
      // Never `includeUnassigned`: a row with no number is a broadcast-era
      // message, and belongs to the other tab.
      scope={{ numberIds: ownNumbers.map((n) => n.id), includeUnassigned: false }}
      basePath="/whatsapp/personal"
      keep={chosen ? { number: chosen.id } : undefined}
      intro={
        <>
          {chosen ? <>Showing <strong>{chosen.counsellorName ?? chosen.label}</strong>&apos;s chats only.{candidates.length > 1 ? <> <Link href="/whatsapp/personal" className="underline">Choose another counsellor</Link>. </> : " "}</> : null}
          Conversations on the counsellors&apos; own numbers. A message from somebody not yet in
          the CRM <strong>creates a lead</strong> here, assigned to whoever owns the phone —
          the opposite of the broadcast number, and deliberately so. Replies leave from the
          counsellor&apos;s own number; a free-form one only reaches somebody who has messaged
          that number in the last 24 hours.
        </>
      }
      emptyNotice={
        candidates.length === 0 ? (
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
