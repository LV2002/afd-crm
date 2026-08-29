import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { adAudienceMembers, leads } from "@/lib/db/schema";
import { computeAudienceDiff, isRetargetingEligible, type RetargetingCandidate } from "@/lib/integrations/audience-sync";
import { getGoogleAdsAccessToken, type GoogleAdsCredentials } from "@/lib/integrations/google/ads-client";
import { addUsersToList, createUserList, removeUsersFromList } from "@/lib/integrations/google/audience-client";
import { getIntegrationCredentials, setIntegrationCredential } from "@/lib/integrations/credentials";
import { hashPhoneE164 } from "@/lib/integrations/hash-pii";

export const dynamic = "force-dynamic";

/**
 * Mirrors `/api/cron/retargeting-sync/meta` exactly in shape (same
 * eligibility rules, same diff-based two-way sync against
 * `ad_audience_members`) — the only real differences are Google's own API
 * mechanics: an OAuth token refresh up front, a Customer Match user list
 * instead of a Custom Audience, and E.164-formatted (not digits-only)
 * phone hashing (`hashPhoneE164` — see docs/DECISIONS.md).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    developer_token: developerToken,
    customer_id: customerId,
    login_customer_id: loginCustomerId,
    user_list_resource_name: existingUserListResourceName,
  } = await getIntegrationCredentials("google", [
    "client_id",
    "client_secret",
    "refresh_token",
    "developer_token",
    "customer_id",
    "login_customer_id",
    "user_list_resource_name",
  ]);

  if (!clientId || !clientSecret || !refreshToken || !developerToken || !customerId) {
    return NextResponse.json({ error: "Google Ads credentials not fully configured" }, { status: 200 });
  }

  const accessToken = await getGoogleAdsAccessToken(clientId, clientSecret, refreshToken);
  const credentials: GoogleAdsCredentials = { developerToken, accessToken, loginCustomerId };

  let userListResourceName = existingUserListResourceName;
  if (!userListResourceName) {
    userListResourceName = await createUserList(customerId, credentials, "AFD India CRM — consented leads");
    await setIntegrationCredential("google", "user_list_resource_name", userListResourceName);
  }

  const allLeads: RetargetingCandidate[] = await db
    .select({
      id: leads.id,
      deletedAt: leads.deletedAt,
      consentStatus: leads.consentStatus,
      doNotContact: leads.doNotContact,
      optedOutChannels: leads.optedOutChannels,
      primaryPhone: leads.primaryPhone,
      email: leads.email,
    })
    .from(leads);
  const leadById = new Map(allLeads.map((l) => [l.id, l]));

  const eligibleLeadIds = allLeads.filter(isRetargetingEligible).map((l) => l.id);

  const syncedRows = await db
    .select({ leadId: adAudienceMembers.leadId })
    .from(adAudienceMembers)
    .where(eq(adAudienceMembers.platform, "google"));
  const syncedLeadIds = syncedRows.map((r) => r.leadId);

  const { toAdd, toRemove } = computeAudienceDiff(eligibleLeadIds, syncedLeadIds);

  const phonesFor = (ids: string[]) =>
    ids
      .map((id) => leadById.get(id)?.primaryPhone)
      .filter((phone): phone is string => Boolean(phone))
      .map(hashPhoneE164);

  if (toAdd.length > 0) await addUsersToList(customerId, credentials, userListResourceName, phonesFor(toAdd));
  if (toRemove.length > 0) await removeUsersFromList(customerId, credentials, userListResourceName, phonesFor(toRemove));

  if (toAdd.length > 0) {
    await db.insert(adAudienceMembers).values(toAdd.map((leadId) => ({ platform: "google" as const, leadId })));
  }
  if (toRemove.length > 0) {
    await db
      .delete(adAudienceMembers)
      .where(and(eq(adAudienceMembers.platform, "google"), inArray(adAudienceMembers.leadId, toRemove)));
  }

  return NextResponse.json({ userListResourceName, added: toAdd.length, removed: toRemove.length, eligible: eligibleLeadIds.length });
}
