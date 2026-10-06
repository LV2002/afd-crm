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
  isWithinCustomerServiceWindowForPhone,
} from "@/lib/whatsapp/get-thread";
import { getWhatsAppThreads } from "@/lib/whatsapp/get-threads";
import { createClient } from "@/lib/supabase/server";

import { UnmatchedThread } from "./unmatched-thread";
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
  searchParams: Promise<{ thread?: string; q?: string; filter?: string; who?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.read")) return <AccessDenied />;

  const { thread: selectedKey, q, filter, who } = await searchParams;
  const search = (q ?? "").trim().toLowerCase();
  const onlyAwaiting = filter === "awaiting";
  const onlyUnmatched = filter === "unmatched";

  const supabase = await createClient();
  const threads = await getWhatsAppThreads(supabase);

  const awaitingCount = threads.filter((t) => t.awaitingReply).length;
  const unmatchedCount = threads.filter((t) => t.leadId === null).length;

  /*
    Whose conversations to show.

    This adds no access: RLS already scopes `whatsapp_messages` through
    the lead, so a counsellor's `threads` is their own and this picker
    has nothing to offer them. For a centre head, a co-admin or an admin,
    `threads` already spans their people — and an undifferentiated pile of
    everybody's conversations is close to unreadable, which is the actual
    problem. So the counsellors are the ones present in what the caller
    can already see, derived rather than queried, and the picker only
    appears when there is more than one of them.
  */
  const counsellors = Array.from(
    new Map(
      threads
        .filter((t) => t.assignedTo && t.counsellorName)
        .map((t) => [t.assignedTo as string, t.counsellorName as string]),
    ),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const unassignedCount = threads.filter((t) => !t.assignedTo).length;
  const canSwitchCounsellor = counsellors.length > 1 || (counsellors.length === 1 && unassignedCount > 0);

  const visible = threads.filter((thread) => {
    if (onlyAwaiting && !thread.awaitingReply) return false;
    if (onlyUnmatched && thread.leadId !== null) return false;
    if (who === "unassigned" && thread.assignedTo) return false;
    if (who && who !== "unassigned" && thread.assignedTo !== who) return false;
    if (!search) return true;
    return (
      thread.leadName.toLowerCase().includes(search) ||
      thread.phone.includes(search) ||
      thread.lastMessagePreview.toLowerCase().includes(search)
    );
  });

  const selected = selectedKey ? (threads.find((t) => t.key === selectedKey) ?? null) : null;

  // A `lead:<id>` key that matched nothing: the Chat button on a lead who
  // has never exchanged a message. Kept so the empty panel can say that,
  // and link back, rather than shrugging.
  const askedForLeadId =
    !selected && selectedKey?.startsWith("lead:") ? selectedKey.slice("lead:".length) : null;

  const [messages, withinWindow] = selected
    ? selected.leadId
      ? await Promise.all([
          getWhatsAppThread(supabase, selected.leadId),
          isWithinCustomerServiceWindow(supabase, selected.leadId),
        ])
      : await Promise.all([
          getWhatsAppThreadByPhone(supabase, selected.phone),
          // Hardcoded false until now, which was true of what the screen
          // could do rather than of the conversation: an unmatched thread
          // exists because somebody wrote to us, so the window is usually
          // wide open.
          isWithinCustomerServiceWindowForPhone(supabase, selected.phone),
        ])
    : [[], false];

  function href(params: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const thread = params.thread ?? selectedKey;
    const query = params.q ?? q;
    const nextFilter = params.filter ?? filter;
    const nextWho = params.who ?? who;
    if (thread) next.set("thread", thread);
    if (query) next.set("q", query);
    if (nextFilter) next.set("filter", nextFilter);
    if (nextWho) next.set("who", nextWho);
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
            {who && <input type="hidden" name="who" value={who} />}
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

          {canSwitchCounsellor && (
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <span className="pr-1 text-xs uppercase tracking-wide text-muted-foreground">
                Counsellor
              </span>
              <FilterLink href={href({ who: "" })} active={!who}>
                Everyone
              </FilterLink>
              {counsellors.map(([id, name]) => (
                <FilterLink key={id} href={href({ who: id })} active={who === id}>
                  {name}
                </FilterLink>
              ))}
              {unassignedCount > 0 && (
                <FilterLink href={href({ who: "unassigned" })} active={who === "unassigned"}>
                  Unassigned ({unassignedCount})
                </FilterLink>
              )}
            </div>
          )}

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
                <UnmatchedThread
                  phone={selected.phone}
                  messages={messages}
                  canSend={can(user, "whatsapp.send")}
                  canCreateLead={can(user, "lead.create")}
                  withinWindow={withinWindow}
                />
              )}
            </>
          ) : askedForLeadId ? (
            /*
              Arrived from a lead's Chat button, and that lead has never
              exchanged a message on this number.

              Worth answering properly rather than showing "pick a
              conversation", because the person did pick one — the answer
              is that there is nothing to pick. And the reason they cannot
              simply start one is Meta's, not this CRM's: a free-form
              message is only allowed inside the 24 hours somebody else's
              message opens, which is the same rule stated on every other
              screen that touches WhatsApp.
            */
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm font-medium">No WhatsApp conversation with this lead yet.</p>
              <p className="max-w-md text-sm text-muted-foreground">
                A conversation appears here once they message the institute&apos;s number, or
                once a broadcast to them gets a reply. WhatsApp only accepts a free-form
                message within 24 hours of theirs — that is Meta&apos;s rule — so to write
                first, message them from the WhatsApp Business app on your phone.
              </p>
              <Link href={`/leads/${askedForLeadId}`} className="text-sm font-medium underline">
                Back to the lead
              </Link>
            </div>
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
