import Link from "next/link";
import { CalendarClock, NotebookPen, Plus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, type SessionUser } from "@/lib/auth/session";
import { formatTerm, type TerminologyMap } from "@/lib/terminology/terms";

/**
 * The four things a counsellor does from a standing start.
 *
 * This is where **Your day** used to be. The queue was right twice over
 * — the work, in order — and in the wrong place: it is a long list, and
 * a long list in the dashboard's right-hand column squeezed the numbers
 * beside it into a narrow ladder. It now lives at the top of
 * **Follow-ups**, next to the dated queue it belongs with, and this
 * column holds something that is genuinely narrow.
 *
 * ## Why these four
 *
 * They are the actions with no natural home on another screen. Adding a
 * lead and logging an interaction both start by hunting for a button;
 * "all leads" and "today's follow-ups" are the two lists people type
 * URLs for. Anything already one click away in the sidebar is
 * deliberately absent — a second route to one screen is how one of them
 * ends up stale.
 *
 * Each is permission-gated, and a counsellor who cannot create a lead
 * simply has a shorter list rather than a button that refuses them.
 */

interface QuickLink {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /**
   * The kind of action, not decoration. Create, time-bound, record,
   * browse — four kinds, four colours, so after a week somebody hits the
   * right one by its colour and shape without reading the label. The
   * label is still there, and still says the same thing, for the week
   * before that and for anyone who does not see the difference.
   */
  tone: keyof typeof TONES;
}

const TONES = {
  create: "border-primary/25 bg-primary-subtle text-primary-ink",
  due: "border-warning/30 bg-warning-subtle text-warning-ink",
  record: "border-info/25 bg-info-subtle text-info-ink",
  browse: "border-border bg-muted text-muted-foreground",
} as const;

export function QuickLinksWidget({
  user,
  terms,
}: {
  user: SessionUser;
  terms: TerminologyMap;
}) {
  const leadSingular = formatTerm(terms, "lead", "singular").toLowerCase();
  const leadPlural = formatTerm(terms, "lead", "plural").toLowerCase();

  const links: QuickLink[] = [];

  if (can(user, "lead.create")) {
    links.push({
      href: "/leads/new",
      label: `Add a ${leadSingular}`,
      hint: "A walk-in, or a call that came to you directly",
      icon: Plus,
      tone: "create",
    });
  }

  if (can(user, "lead.read")) {
    links.push(
      {
        /*
          Straight to the queue that was in this column until today.
          The anchor matters: Follow-ups opens on the dated list, and
          somebody pressing "Today's follow-ups" means the queue, not
          the screen it sits on.
        */
        href: "/follow-ups#your-day",
        label: "Today's follow-ups",
        hint: "Overdue first, then what is due today",
        icon: CalendarClock,
        tone: "due",
      },
      {
        // The interaction log lives on a lead, so there is no form to
        // open cold. Search is the honest route: find the person, then
        // log the call against them.
        href: "/leads?followup=today",
        label: "Log an interaction",
        hint: `Open a ${leadSingular} and use the log panel on the right`,
        icon: NotebookPen,
        tone: "record",
      },
      {
        href: "/leads",
        label: `View all ${leadPlural}`,
        hint: "The full list, with every filter",
        icon: Users,
        tone: "browse",
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick links</CardTitle>
        <CardDescription>The things you do most, without hunting for them.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing here for your role — your work starts on another screen.
          </p>
        ) : (
          links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-start gap-3 rounded-md border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-primary-subtle/50"
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-md border ${TONES[link.tone]}`}
                aria-hidden
              >
                <link.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{link.label}</span>
                <span className="block text-xs text-muted-foreground">{link.hint}</span>
              </span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
