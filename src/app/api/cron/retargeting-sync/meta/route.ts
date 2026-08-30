import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { adAudienceMembers, leads } from "@/lib/db/schema";
import { computeAudienceDiff, isRetargetingEligible, type RetargetingCandidate } from "@/lib/integrations/audience-sync";
import { getIntegrationCredentials, setIntegrationCredential } from "@/lib/integrations/credentials";
import { hashPhone } from "@/lib/integrations/hash-pii";
import { addUsersToAudience, createCustomAudience, removeUsersFromAudience } from "@/lib/integrations/meta/audience-client";

export const dynamic = "force-dynamic";

/**
 * "Send every lead back to Meta for retargeting automatically... reflected
 * once a day" — a real diff against `ad_audience_members`, not a one-way
 * add: a lead whose consent gets withdrawn or who is later marked
 * do-not-contact has to come back OUT of the live Meta audience, not just
 * stop being added going forward. See `isRetargetingEligible()`'s own
 * comment for exactly what "consenting" means here (Leon confirmed
 * consent basis before this was built — docs/DECISIONS.md).
 *
 * Selects the whole `leads` table unfiltered, same reasoning as the SLA
 * sweep's own comment: AFD's real volume (~200 leads/month) makes this
 * cheaper than a per-row query, and `toRemove` needs to look up a lead
 * that may have JUST become ineligible (soft-deleted, opted out) in the
 * same run — it has to still be in the set being scanned.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    ad_account_id: adAccountId,
    ads_access_token: accessToken,
    custom_audience_id: existingAudienceId,
  } = await getIntegrationCredentials("meta", ["ad_account_id", "ads_access_token", "custom_audience_id"]);

  if (!adAccountId || !accessToken) {
    return NextResponse.json({ error: "Meta ad_account_id/ads_access_token not configured" }, { status: 200 });
  }

  let audienceId = existingAudienceId;
  if (!audienceId) {
    audienceId = await createCustomAudience(adAccountId, accessToken, "AFD India CRM — consented leads");
    await setIntegrationCredential("meta", "custom_audience_id", audienceId);
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
    .where(eq(adAudienceMembers.platform, "meta"));
  const syncedLeadIds = syncedRows.map((r) => r.leadId);

  const { toAdd, toRemove } = computeAudienceDiff(eligibleLeadIds, syncedLeadIds);

  const phonesFor = (ids: string[]) =>
    ids
      .map((id) => leadById.get(id)?.primaryPhone)
      .filter((phone): phone is string => Boolean(phone))
      .map(hashPhone);

  if (toAdd.length > 0) await addUsersToAudience(audienceId, accessToken, phonesFor(toAdd));
  if (toRemove.length > 0) await removeUsersFromAudience(audienceId, accessToken, phonesFor(toRemove));

  if (toAdd.length > 0) {
    await db.insert(adAudienceMembers).values(toAdd.map((leadId) => ({ platform: "meta" as const, leadId })));
  }
  if (toRemove.length > 0) {
    await db
      .delete(adAudienceMembers)
      .where(and(eq(adAudienceMembers.platform, "meta"), inArray(adAudienceMembers.leadId, toRemove)));
  }

  return NextResponse.json({ audienceId, added: toAdd.length, removed: toRemove.length, eligible: eligibleLeadIds.length });
}
