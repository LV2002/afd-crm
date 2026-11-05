"use client";

import {
  BarChart3,
  ClipboardList,
  GraduationCap,
  Inbox,
  CalendarClock,
  Database,
  MessageCircle,
  Landmark,
  LayoutDashboard,
  Settings,
  UserRound,
  Users2,
  Sparkles,
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
  "hr-me": UserRound,
  "hr-people": Users2,
  orphans: Inbox,
  database: Database,
  leads: Users,
  "follow-ups": CalendarClock,
  accounts: Wallet,
  finance: Landmark,
  students: GraduationCap,
  whatsapp: MessageCircle,
  "profile-forms": ClipboardList,
  insights: BarChart3,
  marketing: TrendingUp,
  ask: Sparkles,
  settings: Settings,
};
