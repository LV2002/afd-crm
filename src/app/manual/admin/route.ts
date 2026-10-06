import { NextResponse } from "next/server";

import { can, getCurrentUser } from "@/lib/auth/session";

import { serveBook } from "../serve";

export const dynamic = "force-dynamic";

/**
 * The administrator handbook — the staff one plus Settings, the
 * integrations and the technical troubleshooting.
 *
 * Behind `settings.manage` because that is exactly who the extra
 * material is addressed to: the chapters it adds are the screens that
 * permission unlocks. A counsellor following a link here is sent to the
 * staff handbook rather than shown an error, because the thing they were
 * looking for is almost certainly in it.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }
  if (!can(user, "settings.manage")) {
    return NextResponse.redirect(new URL("/manual", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }

  return serveBook("manual-admin.html");
}
