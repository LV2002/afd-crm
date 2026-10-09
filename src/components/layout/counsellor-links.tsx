"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

export interface CounsellorLink {
  userId: string;
  name: string;
}

/** Where a counsellor's own view lives. One definition, so the sidebar and the page agree. */
export const counsellorHref = (userId: string) => `/dashboard/team/${userId}`;

/**
 * The counsellors, nested under Dashboard in the navigation.
 *
 * Leon wanted this IN the left navigation, opening underneath Dashboard,
 * rather than as a row of chips across the top of the page: it is where he
 * already looks to move between screens, and a list of people grows by a
 * line per hire where a chip row wraps into a block.
 *
 * It shows only while Dashboard is open (the caller decides), so the
 * sidebar stays short for the rest of the day. Links, not a client-side
 * switcher — each person's view is a real page with a real address, so it
 * can be bookmarked, sent to a co-admin, or pressed Back out of.
 *
 * Shared by the desktop sidebar and the phone drawer: two copies of a list
 * of people would drift, and the one that is only used on a phone is the
 * one nobody would notice drifting.
 */
export function CounsellorLinks({
  counsellors,
  pathname,
  touch = false,
}: {
  counsellors: CounsellorLink[];
  pathname: string;
  /** Larger rows for the phone drawer, operated with a thumb. */
  touch?: boolean;
}) {
  if (counsellors.length === 0) return null;

  return (
    <ul
      aria-label="Counsellors"
      // The rule on the left is what says "these belong to Dashboard".
      className="ml-5 flex flex-col gap-0.5 border-l border-border pl-2"
    >
      {counsellors.map((counsellor) => {
        const href = counsellorHref(counsellor.userId);
        const active = pathname === href;
        return (
          <li key={counsellor.userId}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center rounded-md px-3 font-medium transition-colors",
                touch ? "min-h-11 text-[0.9375rem]" : "min-h-9 text-sm",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/80 hover:bg-primary-subtle hover:text-primary-ink",
              )}
            >
              <span className="min-w-0 truncate">{counsellor.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
