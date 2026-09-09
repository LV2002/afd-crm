"use client";

import {
  ArrowRightLeft,
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
import type { NavIconKey } from "@/lib/auth/nav";

/**
 * Icon components are not serialisable across the Server -> Client
 * Component boundary, so NavItem only carries an iconKey string. This map
 * — owned entirely by this client component — is where that key gets
 * resolved back to an actual icon.
 */
export const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
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
  handovers: ArrowRightLeft,
  ask: Sparkles,
  settings: Settings,
};
