import { eq, isNull, and, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db/client";
import { whatsappLinks } from "@/lib/db/schema";

/**
 * A tracked short link from a WhatsApp message.
 *
 * Public on purpose — the person tapping it has no account. It reads one
 * row by its random code, counts the click and redirects; it exposes
 * nothing but the destination the sender already put in the message.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[a-z0-9]{4,16}$/.test(code)) return new NextResponse("Not found", { status: 404 });

  const [link] = await db
    .update(whatsappLinks)
    .set({ clicks: sql`${whatsappLinks.clicks} + 1`, lastClickedAt: new Date() })
    .where(and(eq(whatsappLinks.code, code), isNull(whatsappLinks.deletedAt)))
    .returning({ url: whatsappLinks.url });
  if (!link) return new NextResponse("This link is no longer active.", { status: 404 });
  return NextResponse.redirect(link.url, 302);
}
