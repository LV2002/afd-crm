import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WhatsAppPanel } from "@/components/whatsapp/whatsapp-panel";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { maskPhone } from "@/lib/leads/mask-phone";
import { getWhatsAppThread, isWithinCustomerServiceWindow } from "@/lib/whatsapp/get-thread";
import { getWhatsAppThreads } from "@/lib/whatsapp/get-threads";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * The WhatsApp Business API inbox.
 *
 * Named for the platform on purpose. This is not the WhatsApp Business
 * app on anybody's phone and cannot read it: a phone number is either
 * registered to the Cloud API or in use by that app, never both. What
 * shows here is every conversation on the number(s) AFD has connected to
 * the API, and nothing else.
 *
 * Every thread belongs to a lead — the webhook resolves an inbound
 * message to one through the same `resolveOrCreateLead()` every other
 * source goes through, so the tagging Leon asked for is not a step anyone
 * has to remember. Which threads a person sees falls out of that: RLS
 * scopes `whatsapp_messages` through its lead, so a counsellor's inbox is
 * their own leads and a centre head's is their centre's, with no
 * "whose inbox" control to get wrong.
 *
 * The composer stays on the lead page as well as living here. Both send
 * through the same API; this screen is for working down a list of
 * conversations, the lead page is for when you are already looking at the
 * person.
 */
export default async function WhatsAppInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; q?: string; filter?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.read")) return <AccessDenied />;

  const { lead: selectedLeadId, q, filter } = await searchParams;
  const search = (q ?? "").trim().toLowerCase();
  const onlyAwaiting = filter === "awaiting";

  const supabase = await createClient();
  const threads = await getWhatsAppThreads(supabase);

  const awaitingCount = threads.filter((thread) => thread.awaitingReply).length;
  const visible = threads.filter((thread) => {
    if (onlyAwaiting && !thread.awaitingReply) return false;
    if (!search) return true;
    return (
      thread.leadName.toLowerCase().includes(search) ||
      thread.phone.includes(search) ||
      thread.lastMessagePreview.toLowerCase().includes(search)
    );
  });

  // Selecting a thread that isn't in this caller's scope reads as "no
  // messages" rather than as an error — RLS returns nothing either way,
  // and the list beside it never offered the row.
  const selected = selectedLeadId
    ? (threads.find((thread) => thread.leadId === selectedLeadId) ?? null)
    : null;

  const [messages, withinWindow] = selected
    ? await Promise.all([
        getWhatsAppThread(supabase, selected.leadId),
        isWithinCustomerServiceWindow(supabase, selected.leadId),
      ])
    : [[], false];

  function href(params: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    if (params.lead ?? selectedLeadId) next.set("lead", params.lead ?? selectedLeadId!);
    if (params.q ?? q) next.set("q", params.q ?? q!);
    if (params.filter ?? (onlyAwaiting ? "awaiting" : undefined)) {
      next.set("filter", params.filter ?? "awaiting");
    }
    const query = next.toString();
    return query ? `/whatsapp?${query}` : "/whatsapp";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Conversations on the WhatsApp Business API numbers connected to this CRM. Every thread is
          already tied to a lead — open one to reply, or open the lead for their full history.
          You see the threads for the leads you can see.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col gap-3">
          <form action="/whatsapp" method="get" className="flex flex-col gap-2">
            {selectedLeadId && <input type="hidden" name="lead" value={selectedLeadId} />}
            {onlyAwaiting && <input type="hidden" name="filter" value="awaiting" />}
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search a name, number or message…"
              className="h-9"
            />
          </form>

          <div className="flex items-center gap-2 text-sm">
            <Link
              href={href({ filter: "" })}
              className={cn(
                "rounded-md px-3 py-1.5",
                onlyAwaiting
                  ? "text-muted-foreground hover:bg-accent/50"
                  : "bg-accent font-medium",
              )}
            >
              All ({threads.length})
            </Link>
            <Link
              href={href({ filter: "awaiting" })}
              className={cn(
                "rounded-md px-3 py-1.5",
                onlyAwaiting
                  ? "bg-accent font-medium"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              Needs a reply ({awaitingCount})
            </Link>
          </div>

          <div className="flex max-h-[70vh] flex-col overflow-y-auto rounded-lg border">
            {visible.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {threads.length === 0
                  ? "No WhatsApp conversations yet. They appear here as soon as somebody messages a connected number, or a counsellor sends the first message from a lead's page."
                  : "Nothing matches."}
              </p>
            ) : (
              visible.map((thread) => (
                <Link
                  key={thread.leadId}
                  href={href({ lead: thread.leadId })}
                  className={cn(
                    "flex flex-col gap-0.5 border-b p-3 last:border-b-0 hover:bg-accent/40",
                    thread.leadId === selectedLeadId && "bg-accent",
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
                    {/* A bulk, scrollable list of numbers is exactly what
                        CLAUDE.md non-negotiable #6 is about. */}
                    <span className="text-xs text-muted-foreground">
                      {maskPhone(thread.phone)}
                    </span>
                    {thread.counsellorName && (
                      <span className="text-xs text-muted-foreground">
                        · {thread.counsellorName}
                      </span>
                    )}
                    {thread.awaitingReply && (
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
                <Link
                  href={`/leads/${selected.leadId}`}
                  className="text-sm font-medium underline"
                >
                  Open the lead
                </Link>
              </div>
              <WhatsAppPanel
                leadId={selected.leadId}
                toPhone={selected.phone}
                messages={messages}
                canSend={can(user, "whatsapp.send")}
                withinWindow={withinWindow}
              />
            </>
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Pick a conversation to read and reply.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
