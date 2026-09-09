import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { captureError } from "@/lib/errors/capture";

export const dynamic = "force-dynamic";

/**
 * Where a crashed screen reports itself.
 *
 * A React error boundary runs in the browser and cannot write to the
 * database, so the boundary posts here instead. Without this, the entire
 * class of "the page went white for a counsellor in Kannur" is invisible.
 *
 * **Only for signed-in users.** Not because the reports are sensitive but
 * because an open endpoint that writes a row and can send an email is an
 * open endpoint somebody will eventually use to send four hundred emails.
 * A crash on the login page is the one thing this misses, and Vercel's own
 * logs still have it.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let payload: { message?: unknown; digest?: unknown; path?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const message = typeof payload.message === "string" ? payload.message.slice(0, 500) : "A screen crashed";

  await captureError({
    source: "page",
    error: new Error(message),
    context: {
      // Which screen, and who saw it — the two things that make a white
      // page reproducible.
      path: typeof payload.path === "string" ? payload.path.slice(0, 200) : null,
      digest: typeof payload.digest === "string" ? payload.digest.slice(0, 80) : null,
      role: user.roleCode,
    },
  });

  return NextResponse.json({ ok: true });
}
