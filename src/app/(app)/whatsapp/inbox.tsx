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
import { getWhatsAppThreads, type ThreadScope } from "@/lib/whatsapp/get-threads";
import { createClient } from "@/lib/supabase/server";
import { chipClass } from "@/components/whatsapp/label-colours";
import { loadConversationExtras, loadLabels, loadSavedReplies, loadSendableTemplates } from "@/lib/whatsapp/inbox-tools";

import { UnmatchedThread } from "./unmatched-thread";
import { cn } from "@/lib/utils";

/**
 * One inbox, rendered twice.
 *
 * **WhatsApp** (`/whatsapp/personal`) is the counsellors' own Coexistence
 * numbers — the one-to-one conversations, and where every reply leaves
 * from. **WhatsApp API** (`/whatsapp`) is the institute's broadcast
 * number: replies to campaigns, and every message sent before there was
 * more than one number.
 *
 * They are the same screen because they are the same job. What differs
 * is the `scope` — which numbers' threads to list — and the words at the
 * top. Keeping them one component is what stops the filters, the
 * counsellor switcher and the unmatched-thread handling drifting apart,
 * which is exactly what a copied 340-line page would have done by the
 * second change.
 *
 * Which threads a person sees needs no mechanism of its own. RLS scopes
 * `whatsapp_messages` through the lead, so a counsellor's list is their
 * own leads and a centre head's is their centre's. The replies that
 * matched nobody go to whoever runs campaigns — they sent the broadcast,
 * and they are the only person who can act on it by adding the sender.
 */
export interface InboxParams {
  thread?: string;
  q?: string;
  filter?: string;
  who?: string;
  label?: string;
  number?: string;
}

export async function WhatsAppInbox({
  searchParams,
  scope,
  basePath,
  intro,
  emptyNotice,
  keep,
}: {
  searchParams: Promise<InboxParams>;
  /** Which numbers' threads this inbox shows. See `ThreadScope`. */
  scope: ThreadScope;
  /** Where this inbox's own links point — the two inboxes share every control. */
  basePath: string;
  intro: React.ReactNode;
  /** Shown instead of the list when the scope can hold nothing yet. */
  emptyNotice?: React.ReactNode;
  /** Query params every link and the search form must carry, e.g. the chosen number. */
  keep?: Record<string, string>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.read")) return <AccessDenied />;

  const { thread: selectedKey, q, filter, who, label: labelFilter } = await searchParams;
  const search = (q ?? "").trim().toLowerCase();
  const onlyAwaiting = filter === "awaiting";
  const onlyUnmatched = filter === "unmatched";
  const onlyResolved = filter === "resolved";

  const supabase = await createClient();
  const [threads, labels] = await Promise.all([getWhatsAppThreads(supabase, scope), loadLabels(supabase)]);
  const labelById = new Map(labels.map((l) => [l.id, l]));

  const awaitingCount = threads.filter((t) => t.awaitingReply).length;
  const resolvedCount = threads.filter((t) => t.resolved).length;
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
    if (onlyResolved && !thread.resolved) return false;
    // Resolved conversations are out of the way until asked for.
    if (!onlyResolved && thread.resolved && !search && !labelFilter) return false;
    if (labelFilter && !thread.labelIds.includes(labelFilter)) return false;
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

  // The API inbox answers from the institute's own number (Leon, 2026-10-23);
  // the personal inbox from the replying counsellor's. Everything that
  // differs between the two is this one value.
  const channel = scope.includeUnassigned ? "api" : "own";
  const canReply = can(user, channel === "api" ? "whatsapp.campaign" : "whatsapp.send");
  // On the API number the window belongs to that number alone (rows with no
  // number id); on a personal inbox the old "any number" read stands.
  const windowNumberId = channel === "api" ? null : undefined;

  const [messages, withinWindow] = selected
    ? selected.leadId
      ? await Promise.all([
          getWhatsAppThread(supabase, selected.leadId, scope),
          isWithinCustomerServiceWindow(supabase, selected.leadId, windowNumberId),
        ])
      : await Promise.all([
          getWhatsAppThreadByPhone(supabase, selected.phone, scope),
          // Hardcoded false until now, which was true of what the screen
          // could do rather than of the conversation: an unmatched thread
          // exists because somebody wrote to us, so the window is usually
          // wide open.
          isWithinCustomerServiceWindowForPhone(supabase, selected.phone, windowNumberId),
        ])
    : [[], false];

  const extras = selected ? await loadConversationExtras(supabase, selected.phone) : null;
  const { data: chatRules } = await supabase
    .from("whatsapp_chat_rules")
    .select("ai_suggest_enabled")
    .eq("id", "default")
    .maybeSingle<{ ai_suggest_enabled: boolean }>();
  const aiEnabled = Boolean(chatRules?.ai_suggest_enabled && process.env.GEMINI_API_KEY);
  const [savedReplies, templates] = selected && selected.leadId ? await Promise.all([loadSavedReplies(supabase), loadSendableTemplates()]) : [[], []];
  const windowClosesAt = withinWindow && selected?.lastInboundAt ? new Date(new Date(selected.lastInboundAt).getTime() + 24 * 3_600_000).toISOString() : null;

  function href(params: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const thread = params.thread ?? selectedKey;
    const query = params.q ?? q;
    const nextFilter = params.filter ?? filter;
    const nextWho = params.who ?? who;
    const nextLabel = "label" in params ? params.label : labelFilter;
    if (thread) next.set("thread", thread);
    if (query) next.set("q", query);
    if (nextFilter) next.set("filter", nextFilter);
    if (nextWho) next.set("who", nextWho);
    if (nextLabel) next.set("label", nextLabel);
    for (const [k, v] of Object.entries(keep ?? {})) next.set(k, v);
    const search = next.toString();
    return search ? `${basePath}?${search}` : basePath;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">{intro}</p>

      {emptyNotice}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col gap-3">
          <form action={basePath} method="get" className="flex flex-col gap-2">
            {selectedKey && <input type="hidden" name="thread" value={selectedKey} />}
            {filter && <input type="hidden" name="filter" value={filter} />}
            {labelFilter && <input type="hidden" name="label" value={labelFilter} />}
            {who && <input type="hidden" name="who" value={who} />}
            {Object.entries(keep ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search a name, number or message…"
              className="h-9"
            />
          </form>

          <div className="flex flex-wrap items-center gap-1 text-sm">
            <FilterLink href={href({ filter: "", label: "" })} active={!onlyAwaiting && !onlyUnmatched && !onlyResolved && !labelFilter}>
              Open ({threads.length - resolvedCount})
            </FilterLink>
            <FilterLink href={href({ filter: "awaiting" })} active={onlyAwaiting}>
              Needs a reply ({awaitingCount})
            </FilterLink>
            {resolvedCount > 0 && (
              <FilterLink href={href({ filter: "resolved" })} active={onlyResolved}>
                Resolved ({resolvedCount})
              </FilterLink>
            )}
            {unmatchedCount > 0 && (
              <FilterLink href={href({ filter: "unmatched" })} active={onlyUnmatched}>
                Not in the CRM ({unmatchedCount})
              </FilterLink>
            )}
          </div>

          {labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <span className="pr-1 text-xs uppercase tracking-wide text-muted-foreground">Label</span>
              {labels.map((l) => (
                <Link
                  key={l.id}
                  href={href({ label: labelFilter === l.id ? "" : l.id })}
                  className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", chipClass(l.colour), labelFilter === l.id ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100")}
                >
                  {l.name}
                </Link>
              ))}
            </div>
          )}

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
                    "flex gap-3 border-b p-3 last:border-b-0 hover:bg-accent/40",
                    thread.key === selectedKey && "bg-accent",
                  )}
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-lg font-medium text-[#54656f] dark:bg-[#6a7175] dark:text-white">
                    {thread.leadName.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase() || "#"}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{thread.leadName}</span>
                    <span className={cn("shrink-0 text-xs", thread.awaitingReply ? "font-medium text-[#00a884]" : "text-muted-foreground")}>
                      {formatDateIST(thread.lastMessageAt, "d MMM yyyy") === formatDateIST(new Date(), "d MMM yyyy")
                        ? formatDateIST(thread.lastMessageAt, "h:mm a")
                        : formatDateIST(thread.lastMessageAt, "d MMM")}
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
                    {thread.labelIds.map((id) => {
                      const l = labelById.get(id);
                      return l ? (
                        <span key={id} className={cn("rounded-full px-2 py-0 text-[0.6875rem] font-medium", chipClass(l.colour))}>{l.name}</span>
                      ) : null;
                    })}
                    {thread.resolved && <Badge variant="secondary" className="ml-auto">Resolved</Badge>}
                    {thread.leadId !== null && thread.awaitingReply && (
                      <Badge variant="outline" className="ml-auto">
                        Reply
                      </Badge>
                    )}
                  </div>
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
                  leadName={selected.leadName}
                  toPhone={selected.phone}
                  windowClosesAt={windowClosesAt}
                  savedReplies={savedReplies}
                  templates={templates}
                  canSendTemplates={can(user, "whatsapp.campaign")}
                  labels={labels}
                  labelIds={extras?.labelIds ?? []}
                  resolved={extras?.resolved ?? false}
                  notes={extras?.notes ?? []}
                  messages={messages}
                  canSend={canReply}
                  withinWindow={withinWindow}
                  channel={channel}
                  aiEnabled={aiEnabled}
                />
              ) : (
                <UnmatchedThread
                  phone={selected.phone}
                  messages={messages}
                  canSend={canReply}
                  canCreateLead={can(user, "lead.create")}
                  withinWindow={withinWindow}
                  channel={channel}
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
