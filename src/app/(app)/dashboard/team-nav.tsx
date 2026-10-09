"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { TeamCentre } from "@/lib/dashboard/get-team-members";

/**
 * A row of the people a manager can look in on, under the dashboard.
 *
 * Leon: *"they should be able to see small sub navigations under
 * dashboard that allow them to switch between the counsellors under
 * them, like if they have 1 center they should see sub navigation with
 * each counsellor in that center."*
 *
 * So: **Overview** first, then a chip per person. With one centre that
 * is a single row and the centre name is left off — naming the only
 * centre somebody has tells them nothing. With two or more each group
 * gets its own line with the centre's name, which is the shape of the
 * question a head of two centres is asking.
 *
 * Links rather than a client-side switcher. Each person's view is a real
 * page with a real address, so a head can keep one open, send it to a
 * co-admin, or press Back out of it — none of which a tab control gives.
 */
export function TeamNav({ centres }: { centres: TeamCentre[] }) {
  const pathname = usePathname();

  if (centres.length === 0) return null;

  const showCentreNames = centres.length > 1;

  return (
    <nav aria-label="Counsellors" className="flex flex-col gap-2 border-b pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip href="/dashboard" active={pathname === "/dashboard"}>
          Overview
        </Chip>
      </div>

      {centres.map((centre) => (
        <div key={centre.centerName} className="flex flex-wrap items-center gap-2">
          {showCentreNames && (
            <span className="text-xs font-medium text-muted-foreground">{centre.centerName}</span>
          )}
          {centre.members.map((member) => {
            const href = `/dashboard/team/${member.userId}`;
            return (
              <Chip key={`${centre.centerName}-${member.userId}`} href={href} active={pathname === href}>
                {member.name}
              </Chip>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Chip({
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
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
          : "rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
      }
    >
      {children}
    </Link>
  );
}
