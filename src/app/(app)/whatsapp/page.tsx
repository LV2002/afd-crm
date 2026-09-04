import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WhatsAppPanel } from "@/components/whatsapp/whatsapp-panel";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { maskPhone } from "@/lib/leads/mask-phone";
import {
  getWhatsAppThread,
  getWhatsAppThreadByPhone,
  isWithinCustomerServiceWindow,
} from "@/lib/whatsapp/get-thread";
import { getWhatsAppThreads } from "@/lib/whatsapp/get-threads";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * Replies to the institute's WhatsApp Business API broadcasts.
 *
 * This number is an outbound marketing channel, not a way in. AFD's
 * enquiries reach the counsellors' own WhatsApp Business apps and are
 * typed into the CRM by hand, so nothing here creates a lead: an inbound
 * message is matched to a lead that already exists, or filed with none.
 *
 * Which threads a person sees needs no mechanism of its own. RLS scopes
 * `whatsapp_messages` through the lead, so a counsellor's list is their
 * own leads and a centre head's is their centre's. The replies that
 * matched nobody go to whoever runs campaigns — they sent the broadcast,
 * and they are the only person who can act on it by adding the sender.
 */
export default async function WhatsAppInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; q?: string; filter?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.read")) return <AccessDenied />;

  const { thread: selectedKey, q, filter } = await searchParams;
  const search = (q ?? "").trim().toLowerCase();
  const onlyAwaiting = filter === "awaiting";
  const onlyUnmatched = filter === "unmatched";

  const supabase = await createClient();
  const threads = await getWhatsAppThreads(supabase);

  const awaitingCount = threads.filter((t) => t.awaitingReply).length;
  const unmatchedCount = threads.filter((t) => t.leadId === null).length;
  const visible = threads.filter((thread) => {
    if (onlyAwaiting && !thread.awaitingReply) return false;
    if (onlyUnmatched && thread.leadId !== null) return false;
    if (!search) return true;
    return (
      thread.leadName.toLowerCase().includes(search) ||
      thread.phone.includes(search) ||
      thread.lastMessagePreview.toLowerCase().includes(search)
    );
  });

  const selected = selectedKey ? (threads.find((t) => t.key === selectedKey) ?? null) : null;

  const [messages, withinWindow] = selected
    ? selected.leadId
      ? await Promise.all([
          getWhatsAppThread(supabase, selected.leadId),
          isWithinCustomerServiceWindow(supabase, selected.leadId),
        ])
      : [await getWhatsAppThreadByPhone(supabase, selected.phone), false]
    : [[], false];

  function href(params: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const thread = params.thread ?? selectedKey;
    const query = params.q ?? q;
    const nextFilter = params.filter ?? filter;
    if (thread) next.set("thread", thread);
    if (query) next.set("q", query);
    if (nextFilter) next.set("filter", nextFilter);
    const search = next.toString();
    return search ? `/whatsapp?${search}` : "/whatsapp";
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Replies to what this number has sent out. Nothing here creates a lead — enquiries come to
        the counsellors&apos; own phones and are entered in the CRM by hand — so a reply is matched
        to a lead you already have, and the assigned counsellor is told. A free-form reply only
        reaches someone who has messaged in the last 24 hours; after that, message them from the
        WhatsApp Business app on your phone.
      </p>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col gap-3">
          <form action="/whatsapp" method="get" className="flex flex-col gap-2">
            {selectedKey && <input type="hidden" name="thread" value={selectedKey} />}
            {filter && <input type="hidden" name="filter" value={filter} />}
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search a name, number or message…"
              className="h-9"
            />
          </form>

          <div className="flex flex-wrap items-center gap-1 text-sm">
            <FilterLink href={href({ filter: "" })} active={!onlyAwaiting && !onlyUnmatched}>
              All ({threads.length})
            </FilterLink>
            <FilterLink href={href({ filter: "awaiting" })} active={onlyAwaiting}>
              Needs a reply ({awaitingCount})
            </FilterLink>
            {unmatchedCount > 0 && (
              <FilterLink href={href({ filter: "unmatched" })} active={onlyUnmatched}>
                Not in the CRM ({unmatchedCount})
              </FilterLink>
            )}
          </div>

          <div className="flex max-h-[70vh] flex-col overflow-y-auto rounded-lg border">
            {visible.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {threads.length === 0
                  ? "Nothing yet. Replies to your broadcasts appear here."
                  : "Nothing matches."}
              </p>
            ) : (
              visible.map((thread) => (
                <Link
                  key={thread.key}
                  href={href({ thread: thread.key })}
                  className={cn(
                    "flex flex-col gap-0.5 border-b p-3 last:border-b-0 hover:bg-accent/40",
                    thread.key === selectedKey && "bg-accent",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{thread.leadName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateIST(thread.lastMessageAt, "d MMM")}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {thread.lastDirection === "outbound" && "You: "}
                    {thread.lastMessagePreview}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {/*
                      A matched thread's number is masked, same as every
                      other bulk list (CLAUDE.md non-negotiable #6). An
                      unmatched one isn't: the number IS the thread's only
                      identity, it is the thing you copy into a new lead,
                      and these rows are only visible to whoever runs
                      campaigns in the first place (migration 0042).
                    */}
                    <span className="text-xs text-muted-foreground">
                      {thread.leadId ? maskPhone(thread.phone) : thread.phone}
                    </span>
                    {thread.counsellorName && (
                      <span className="text-xs text-muted-foreground">
                        · {thread.counsellorName}
                      </span>
                    )}
                    {thread.leadId === null && (
                      <Badge variant="outline" className="ml-auto">
                        Not a lead
                      </Badge>
                    )}
                    {thread.leadId !== null && thread.awaitingReply && (
                      <Badge variant="outline" className="ml-auto">
                        Reply
                      </Badge>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {selected ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{selected.leadName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selected.messageCount} message{selected.messageCount === 1 ? "" : "s"}
                    {selected.counsellorName ? ` · ${selected.counsellorName}` : ""}
                  </p>
                </div>
                {selected.leadId && (
                  <Link href={`/leads/${selected.leadId}`} className="text-sm font-medium underline">
                    Open the lead
                  </Link>
                )}
              </div>

              {selected.leadId ? (
                <WhatsAppPanel
                  leadId={selected.leadId}
                  toPhone={selected.phone}
                  messages={messages}
                  canSend={can(user, "whatsapp.send")}
                  withinWindow={withinWindow}
                />
              ) : (
                <UnmatchedThread phone={selected.phone} messages={messages} />
              )}
            </>
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Pick a conversation to read.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5",
        active ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * A reply from somebody the CRM has never heard of.
 *
 * Read-only, and deliberately so: replying would need a lead to record
 * the message against, and this system does not invent leads from
 * broadcast replies. The useful action is to add them properly, which is
 * a human decision — they may be an existing student's parent, a wrong
 * number, or a genuine enquiry.
 */
function UnmatchedThread({
  phone,
  messages,
}: {
  phone: string;
  messages: Awaited<ReturnType<typeof getWhatsAppThread>>;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="rounded-md border border-dashed p-3">
        <p className="text-sm font-medium">
          {phone} isn&apos;t in the CRM.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          They replied to something you sent, but no lead has this number, so nobody was notified.
          Add them from{" "}
          <Link href="/leads/new" className="font-medium underline">
            Leads → New
          </Link>{" "}
          if they&apos;re worth following up; from then on their replies reach their counsellor.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {messages.map((message) => (
          <div key={message.id} className="flex flex-col gap-0.5 items-start">
            <div className="max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm">
              {message.body ?? <span className="italic opacity-80">(no text)</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDateIST(message.occurredAt, "d MMM yyyy, h:mm a")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
