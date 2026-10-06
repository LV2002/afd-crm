import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";

import { serveBook } from "./serve";

export const dynamic = "force-dynamic";

/**
 * The staff handbook, inside the CRM.
 *
 * Everyone signed in gets this one: it is the whole system as a person
 * uses it, with the Settings chapters and the integration runbooks left
 * out. Administrators get those at `/manual/admin`.
 *
 * Signed in only, like the rest of the application. There is nothing
 * secret in a manual, but it names screens, roles and fee workflows, and
 * an internal tool's documentation is not something to leave on the open
 * web.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }

  return serveBook("manual-staff.html");
}
