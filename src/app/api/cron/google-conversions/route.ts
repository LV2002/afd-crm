import { NextResponse } from "next/server";

import { uploadConversions } from "@/lib/integrations/google/upload-conversions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reports paid admissions back to Google Ads.
 *
 * The work itself is in `lib/integrations/google/upload-conversions.ts`,
 * so the Google ad spend sync can call it too — this route is deliberately
 * NOT in `vercel.json`, because AFD's plan has no cron slots left and the
 * spend sync runs it in the same pass. That pairing is the right one
 * anyway: the job that reads what Google charged and the job that tells
 * Google what it bought belong together.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await uploadConversions());
}
