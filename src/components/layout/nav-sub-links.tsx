"use client";

import Link from "next/link";

import { NavBadge } from "@/components/layout/nav-badge";
import { cn } from "@/lib/utils";

export interface SubLink {
  key: string;
  label: string;
  href: string;
  active: boolean;
  /** A red count beside the entry. Zero or absent shows nothing. */
  count?: number;
  /** What the count counts, for screen readers. */
  countWhat?: string;
}

/**
 * A short list nested under a nav entry: the counsellors under Dashboard,
 * the chat sources under Chats. The rule on the left says "these belong to
 * the entry above". Shared by the desktop sidebar and the phone drawer so
 * the two never drift.
 */
export function NavSubLinks({
  label,
  links,
  touch = false,
}: {
  label: string;
  links: SubLink[];
  /** Larger rows for the phone drawer, operated with a thumb. */
  touch?: boolean;
}) {
  if (links.length === 0) return null;
  return (
    <ul aria-label={label} className="ml-5 flex flex-col gap-0.5 border-l border-border pl-2">
      {links.map((link) => (
        <li key={link.key}>
          <Link
            href={link.href}
            aria-current={link.active ? "page" : undefined}
            className={cn(
              "flex items-center rounded-md px-3 font-medium transition-colors",
              touch ? "min-h-11 text-[0.9375rem]" : "min-h-9 text-sm",
              link.active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/80 hover:bg-primary-subtle hover:text-primary-ink",
            )}
          >
            <span className="min-w-0 truncate">{link.label}</span>
            <NavBadge count={link.count} what={link.countWhat ?? "waiting"} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
