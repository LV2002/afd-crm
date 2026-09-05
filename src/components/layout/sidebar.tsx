"use client";

import {
  BarChart3,
  CalendarRange,
  ClipboardList,
  GraduationCap,
  KanbanSquare,
  MessageCircle,
  Landmark,
  LayoutDashboard,
  Settings,
  Sparkles,
  Sun,
  Users,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavIconKey, NavItem } from "@/lib/auth/nav";
import { cn } from "@/lib/utils";

/**
 * Icon components are not serialisable across the Server -> Client
 * Component boundary, so NavItem only carries an iconKey string. This map
 * — owned entirely by this client component — is where that key gets
 * resolved back to an actual icon.
 */
const ICON_MAP: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  "my-day": Sun,
  leads: Users,
  pipeline: KanbanSquare,
  accounts: Wallet,
  finance: Landmark,
  students: GraduationCap,
  batches: CalendarRange,
  whatsapp: MessageCircle,
  "profile-forms": ClipboardList,
  insights: BarChart3,
  marketing: TrendingUp,
  ask: Sparkles,
  settings: Settings,
};

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = ICON_MAP[item.iconKey];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
