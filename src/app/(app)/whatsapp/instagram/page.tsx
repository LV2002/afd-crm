import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { hasIntegrationCredential } from "@/lib/integrations/credentials";
import {
  conversationTitle,
  getInstagramConversations,
  getInstagramThread,
} from "@/lib/instagram/get-conversations";
import { isWithinInstagramReplyWindow } from "@/lib/instagram/reply-window";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { ConvertToLead } from "./convert-to-lead";
import { InstagramThread } from "./instagram-thread";

/**
 * Instagram DMs.
 *
 * The one deliberate difference from every other inbound channel: a DM
 * does **not** create a lead (docs/DECISIONS.md, 2026-10-04). Most
 * Instagram messages are a question, a reply to a story, or nothing, and
 * a CRM that turns each one into a lead stops being a record of who is
 * enrolling. So a conversation is a conversation, and **Convert to lead**
 * is a button a counsellor presses when it becomes an enquiry.
 *
 * Who sees what needs no mechanism here: `instagram_conversations`' RLS
 * (migration 0081) scopes a converted conversation through its lead, and
 * leaves an unconverted one visible to anybody who works the inbox —
 * because a DM is addressed to the institute, not to a counsellor, and
 * somebody has to answer it.
 */
export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; q?: string; filter?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.read")) return <AccessDenied />;

  const { thread: selectedId, q, filter } = await searchParams;
  const search = (q ?? "").trim().toLowerCase();
  const onlyAwaiting = filter === "awaiting";
  const onlyUnconverted = filter === "unconverted";

  const supabase = await createClient();
  const conversations = await getInstagramConversations(supabase);

  // Asked only when there is nothing to show: with conversations on
  // screen the integration is self-evidently working, and an empty inbox
  // is the only case where "is this even connected?" is the question.
  const connected =
    conversations.length > 0 ||
    ((await hasIntegrationCredential("meta", "ig_user_id")) &&
      (await hasIntegrationCredential("meta", "page_access_token")));

  const awaitingCount = conversations.filter((c) => c.awaitingReply).length;
  const unconvertedCount = conversations.filter((c) => c.leadId === null).length;

  const visible = conversations.filter((conversation) => {
    if (onlyAwaiting && !conversation.awaitingReply) return false;
    if (onlyUnconverted && conversation.leadId !== null) return false;
    if (!search) return true;
    return (
      conversationTitle(conversation).toLowerCase().includes(search) ||
      (conversation.username ?? "").toLowerCase().includes(search) ||
      conversation.lastMessagePreview.toLowerCase().includes(search)
    );
  });

  const selected = selectedId ? (conversations.find((c) => c.id === selectedId) ?? null) : null;
  const messages = selected ? await getInstagramThread(supabase, selected.id) : [];

  function href(params: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const thread = params.thread ?? selectedId;
    const query = params.q ?? q;
    const nextFilter = params.filter ?? filter;
    if (thread) next.set("thread", thread);
    if (query) next.set("q", query);
    if (nextFilter) next.set("filter", nextFilter);
    const qs = next.toString();
    return qs ? `/whatsapp/instagram?${qs}` : "/whatsapp/instagram";
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Messages sent to the institute&apos;s Instagram account. A DM does not create a lead —
        most are a question or a reply to a story — so these are conversations until somebody
        presses <strong>Convert to lead</strong>. Instagram allows a reply only within 24 hours
        of the person&apos;s last message.
      </p>

      {/*
        Always shown when connected, deliberately, and phrased as a
        question rather than a warning.

        Nothing here can detect whether the Meta app is in Development
        mode — the Graph API does not report it — so the alternative to a
        standing note is somebody staring at an inbox containing only
        their own colleagues and concluding the integration is broken.
        That is exactly what happened. It costs one sentence when it is
        irrelevant and saves an afternoon when it is not.
      */}
      {connected && (
        <div className="max-w-3xl rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <strong className="text-foreground">
            Only seeing messages from people who manage the Page?
          </strong>{" "}
          That is Meta, not this CRM. A Meta app starts in <strong>Development mode</strong>, and
          in that state Instagram delivers messages only from people who hold a role on the app —
          which is why your own DMs arrive and a student&apos;s does not. It needs{" "}
          <code>instagram_manage_messages</code> through App Review and the app switched to{" "}
          <strong>Live</strong>. Until then a member of the public&apos;s DM is{" "}
          <strong>not queued anywhere</strong> — it is never delivered, so there is nothing to
          catch up on afterwards. See docs/WHATSAPP-SETUP.md Part 6.
        </div>
      )}

      {!connected && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p>
            <strong>Instagram is not connected yet.</strong> It needs the Instagram account set
            to Professional and linked to the AFD Facebook Page with{" "}
            <em>Connected tools → Allow access to messages</em> on,{" "}
            <code>instagram_manage_messages</code> granted to the Meta app, and the{" "}
            <code>messages</code> webhook pointed at{" "}
            <code>/api/webhooks/instagram</code>. See docs/ADS-SETUP.md § Instagram DMs, then
            enter the Instagram Account ID in{" "}
            <Link href="/settings/integrations/meta" className="underline">
              Settings → Integrations → Meta
            </Link>
            .
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col gap-3">
          <form action="/whatsapp/instagram" method="get" className="flex flex-col gap-2">
            {selectedId && <input type="hidden" name="thread" value={selectedId} />}
            {filter && <input type="hidden" name="filter" value={filter} />}
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search a handle, name or message…"
              className="h-9"
            />
          </form>

          <div className="flex flex-wrap items-center gap-1 text-sm">
            <FilterLink href={href({ filter: "" })} active={!onlyAwaiting && !onlyUnconverted}>
              All ({conversations.length})
            </FilterLink>
            <FilterLink href={href({ filter: "awaiting" })} active={onlyAwaiting}>
              Needs a reply ({awaitingCount})
            </FilterLink>
            {unconvertedCount > 0 && (
              <FilterLink href={href({ filter: "unconverted" })} active={onlyUnconverted}>
                Not a lead ({unconvertedCount})
              </FilterLink>
            )}
          </div>

          <div className="flex max-h-[70vh] flex-col overflow-y-auto rounded-lg border">
            {visible.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {conversations.length === 0
                  ? "No Instagram messages yet."
                  : "Nothing matches."}
              </p>
            ) : (
              visible.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={href({ thread: conversation.id })}
                  className={cn(
                    "flex flex-col gap-0.5 border-b p-3 last:border-b-0 hover:bg-accent/40",
                    conversation.id === selectedId && "bg-accent",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {conversationTitle(conversation)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateIST(conversation.lastMessageAt, "d MMM")}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {conversation.lastDirection === "outbound" && "You: "}
                    {conversation.lastMessagePreview}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {conversation.username && conversation.leadName && (
                      <span className="text-xs text-muted-foreground">@{conversation.username}</span>
                    )}
                    {conversation.counsellorName && (
                      <span className="text-xs text-muted-foreground">
                        · {conversation.counsellorName}
                      </span>
                    )}
                    {conversation.unreadCount > 0 && (
                      <Badge className="ml-auto">{conversation.unreadCount} new</Badge>
                    )}
                    {conversation.unreadCount === 0 && conversation.leadId === null && (
                      <Badge variant="outline" className="ml-auto">
                        Not a lead
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
                  <h2 className="text-lg font-semibold">{conversationTitle(selected)}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selected.messageCount} message{selected.messageCount === 1 ? "" : "s"}
                    {selected.username ? ` · @${selected.username}` : ""}
                    {selected.counsellorName ? ` · ${selected.counsellorName}` : ""}
                  </p>
                </div>
                {selected.leadId && (
                  <Link href={`/leads/${selected.leadId}`} className="text-sm font-medium underline">
                    Open the lead
                  </Link>
                )}
              </div>

              {!selected.leadId && can(user, "lead.create") && (
                <ConvertToLead
                  conversationId={selected.id}
                  suggestedName={selected.name ?? selected.username ?? ""}
                />
              )}

              <InstagramThread
                conversationId={selected.id}
                messages={messages}
                canSend={can(user, "whatsapp.send")}
                withinWindow={isWithinInstagramReplyWindow(selected.lastInboundAt)}
                lastInboundAt={selected.lastInboundAt}
              />
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
