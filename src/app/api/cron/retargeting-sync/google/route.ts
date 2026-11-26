import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";

import { db } from "@/lib/db/client";
import { adAudienceMembers } from "@/lib/db/schema";
import {
  computeAudienceDiff,
  isRetargetingEligible,
  type RetargetingCandidate,
} from "@/lib/integrations/audience-sync";
import { loadRetargetingCandidates } from "@/lib/integrations/retargeting-candidates";
import { retargetingWindowDays } from "@/lib/integrations/retargeting-window";
import {
  getGoogleAdsAccessToken,
  type GoogleAdsCredentials,
} from "@/lib/integrations/google/ads-client";
import {
  addUsersToList,
  createUserList,
  removeUsersFromList,
} from "@/lib/integrations/google/audience-client";
import {
  getIntegrationCredentials,
  setIntegrationCredential,
} from "@/lib/integrations/credentials";
import { syncContactAudience } from "@/lib/integrations/contact-audience";
import { syncListAudiences } from "@/lib/integrations/list-audiences";
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
async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

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
    return NextResponse.json(
      { error: "Google Ads credentials not fully configured" },
      { status: 200 },
    );
  }

  const accessToken = await getGoogleAdsAccessToken(clientId, clientSecret, refreshToken);
  const credentials: GoogleAdsCredentials = { developerToken, accessToken, loginCustomerId };

  let userListResourceName = existingUserListResourceName;
  if (!userListResourceName) {
    userListResourceName = await createUserList(
      customerId,
      credentials,
      "AFD India CRM — consented leads",
    );
    await setIntegrationCredential("google", "user_list_resource_name", userListResourceName);
  }

  const allLeads: RetargetingCandidate[] = await loadRetargetingCandidates();
  const leadById = new Map(allLeads.map((l) => [l.id, l]));

  // One `now` for the whole run, so a lead cannot fall on either side of
  // the cutoff depending on which line of this function evaluated it.
  const window = { windowDays: await retargetingWindowDays(), now: new Date() };
  const eligibleLeadIds = allLeads.filter((lead) => isRetargetingEligible(lead, window)).map((l) => l.id);

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

  if (toAdd.length > 0)
    await addUsersToList(customerId, credentials, userListResourceName, phonesFor(toAdd));
  if (toRemove.length > 0)
    await removeUsersFromList(customerId, credentials, userListResourceName, phonesFor(toRemove));

  if (toAdd.length > 0) {
    await db
      .insert(adAudienceMembers)
      .values(toAdd.map((leadId) => ({ platform: "google" as const, leadId })));
  }
  if (toRemove.length > 0) {
    await db
      .delete(adAudienceMembers)
      .where(
        and(eq(adAudienceMembers.platform, "google"), inArray(adAudienceMembers.leadId, toRemove)),
      );
  }

  // Databases are NOT part of the leads list: each one has its own user list
  // (see lib/integrations/list-audiences.ts). Anyone an earlier version sent
  // into the leads list from a database is taken back out.
  const contactsSync = await syncContactAudience(
    {
      platform: "google",
      add: async () => undefined,
      remove: (phones) =>
        removeUsersFromList(customerId, credentials, userListResourceName, phones.map(hashPhoneE164)),
    },
    { retireOnly: true },
  );
  const databases = await syncListAudiences({
    platform: "google",
    create: (name) => createUserList(customerId, credentials, name),
    add: (id, phones) => addUsersToList(customerId, credentials, id, phones.map(hashPhoneE164)),
    remove: (id, phones) => removeUsersFromList(customerId, credentials, id, phones.map(hashPhoneE164)),
  });

  return NextResponse.json({
    userListResourceName,
    added: toAdd.length,
    removed: toRemove.length,
    eligible: eligibleLeadIds.length,
    excludedAdmitted: allLeads.filter((lead) => lead.hasAdmission).length,
    contacts: contactsSync,
    databases,
  });
}

/**
 * Wrapped so a failure is recorded and emailed rather than disappearing
 * into a 500 that nobody looks at. It re-throws afterwards on purpose:
 * the platform's own retry and alerting depend on the route genuinely
 * failing, and swallowing it here would make a broken job look healthy.
 */
export async function GET(request: Request) {
  return reportingFailures("cron:retargeting-sync/google", () => run(request));
}
