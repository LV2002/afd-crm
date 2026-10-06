/**
 * The two ids that let a form submission line up with what an ad cost.
 *
 * ## The problem this solves
 *
 * `ad_spend_daily` holds what Google and Meta charged, per campaign, per
 * day. The Ad Performance report joins it to leads on
 * `enquiries.campaign_id`. Lead Ads supply that id themselves, so Meta
 * campaigns have always reported correctly — but a submission from a
 * landing-page form arrived with the UTM blob and a GCLID and **no
 * campaign id at all**, so the leads a Google campaign produced could
 * never be shown against its spend. Cost per lead for Google search was
 * unanswerable, and nothing said why.
 *
 * ## Why a campaign *name* is not good enough
 *
 * The obvious move is to put `utm_campaign` into `campaign_id`, and it
 * is wrong. The ad platforms report spend against their own numeric
 * campaign ids; a human name like `brand-search-oct` matches nothing, so
 * the report would grow a campaign with leads and zero spend sitting
 * beside a campaign with spend and zero leads — the same money and the
 * same leads, counted as two things. That is worse than the blank it
 * replaces, because a blank is obviously missing and a wrong row looks
 * like an answer.
 *
 * So an id is accepted only when it is plausibly an id: an explicit
 * `campaign_id` field, or a `utm_campaign` that is all digits — which is
 * what Google's ValueTrack `{campaignid}` and Meta's `{{campaign.id}}`
 * substitute. A campaign name stays in `utm`, where it is still visible
 * on the lead and in the sources report, and simply does not pretend to
 * be a join key.
 *
 * See docs/GOOGLE-ADS-SETUP.md for the Final URL suffix that makes a
 * landing page send these.
 */

/** Google's `{campaignid}` and Meta's `{{campaign.id}}` are both numeric. */
function asPlatformId(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d{3,}$/.test(trimmed) ? trimmed : null;
}

export interface AdIdentifiers {
  campaignId: string | null;
  adId: string | null;
}

/**
 * Picks the campaign and ad ids out of whatever the form sent.
 *
 * Explicit fields win over UTM parameters: a hidden input named
 * `campaign_id` was put there on purpose, while `utm_campaign` is
 * whatever the URL happened to carry.
 */
export function adIdentifiersFrom(utm: Record<string, string> | null): AdIdentifiers {
  if (!utm) return { campaignId: null, adId: null };

  return {
    campaignId: utm.campaign_id?.trim() || asPlatformId(utm.utm_campaign),
    // `{creative}` on Google and `{{ad.id}}` on Meta both land in
    // utm_content by convention; an explicit ad_id beats either.
    adId: utm.ad_id?.trim() || asPlatformId(utm.utm_content),
  };
}
