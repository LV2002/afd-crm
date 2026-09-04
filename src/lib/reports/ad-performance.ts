/**
 * What the advertising cost, and what it produced.
 *
 * `ad_spend_daily` has been syncing from Meta and Google every night since
 * the integrations shipped, and until now nothing read it. This is the
 * join that makes it worth having: spend on one side, the leads and
 * admissions that spend produced on the other, per campaign.
 *
 * Pure — the page fetches and scopes, this only arithmetic — so the
 * numbers that decide an ad budget can be tested against worked examples
 * rather than eyeballed on a screen.
 *
 * ## Two decisions worth stating, because both change the numbers
 *
 * **The join is on campaign id, through the first enquiry.** A campaign is
 * the grain a budget decision is actually made at ("stop running the NIFT
 * one"), and ad-level rows are noisy enough to hide it. First enquiry
 * rather than last, because CLAUDE.md is explicit that first-touch source
 * is never overwritten: the campaign that *found* the person is the one
 * that earned the admission, even if they later filled in a website form.
 *
 * **A lead is counted in the range it arrived in; its admission is counted
 * whenever it happened.** This is the one piece of arithmetic here that
 * could quietly mislead. Filtering admissions by the same date range as
 * the spend would report March's ads as having produced almost nothing,
 * because a March lead typically enrols in May — the cost per admission
 * for any recent month would look catastrophic and improve on its own
 * weeks later. So the cohort is fixed by when the lead arrived and its
 * outcome is followed forward. The trade-off is the honest one instead:
 * a recent month's admissions are genuinely incomplete, and the page says
 * so rather than hiding it in a formula.
 */

/** One night's spend on one campaign, already summed by the caller's query. */
export interface SpendRow {
  platform: string;
  campaignId: string;
  campaignName: string | null;
  spendPaise: number;
  impressions: number;
  clicks: number;
}

/**
 * One lead, with the campaign that found it and what became of it.
 * `netFeePaise` and `collectedPaise` are zero for anybody who never
 * enrolled, so the caller never has to special-case them.
 */
export interface AttributedLead {
  leadId: string;
  platform: string | null;
  campaignId: string | null;
  isAdmission: boolean;
  netFeePaise: number;
  collectedPaise: number;
}

/**
 * Turns the four raw query results into one `AttributedLead` per lead.
 *
 * Lives here rather than in the page because every line of it is a rule
 * somebody could reasonably get wrong: which enquiry decides the campaign,
 * what counts as an admission, whether a refund reduces what was
 * collected, and what a lead with two enrolments is worth. Rules belong
 * where they can be tested.
 */
export interface AttributionInput {
  /** Every lead created in the period, whether or not it came from an ad. */
  leadIds: string[];
  /** All enquiries for those leads, ORDERED OLDEST FIRST — the first one wins. */
  enquiryRows: Array<{ leadId: string; source: string; campaignId: string | null }>;
  /** Only enrolments that count as admissions: past the gate, not dropped. */
  enrolmentRows: Array<{ id: string; leadId: string; netFeePaise: number }>;
  paymentRows: Array<{ enrolmentId: string; amountPaise: number; direction: string }>;
}

/**
 * The two platform names are exactly `ad_platform`'s values, and both
 * webhooks write that same word as the enquiry's source — which is what
 * makes the join to `ad_spend_daily` possible at all. Any other source is
 * not paid advertising.
 */
const AD_PLATFORMS = new Set(["meta", "google"]);

export function attributeLeads(input: AttributionInput): AttributedLead[] {
  const campaignByLead = new Map<string, { platform: string; campaignId: string }>();
  for (const row of input.enquiryRows) {
    // First enquiry wins, and the caller ordered them oldest first.
    // CLAUDE.md: first-touch source is never overwritten — the campaign
    // that FOUND the person earned the admission, even if they later
    // filled in a form on the website.
    if (campaignByLead.has(row.leadId)) continue;
    if (!row.campaignId || !AD_PLATFORMS.has(row.source)) continue;
    campaignByLead.set(row.leadId, { platform: row.source, campaignId: row.campaignId });
  }

  const collectedByEnrolment = new Map<string, number>();
  for (const row of input.paymentRows) {
    // A debit is a reversal or a refund, so it reduces what was collected.
    // Treating it as income would show money the institute gave back as
    // return on ad spend.
    const delta = row.direction === "credit" ? row.amountPaise : -row.amountPaise;
    collectedByEnrolment.set(
      row.enrolmentId,
      (collectedByEnrolment.get(row.enrolmentId) ?? 0) + delta,
    );
  }

  const admissionByLead = new Map<string, { netFeePaise: number; collectedPaise: number }>();
  for (const row of input.enrolmentRows) {
    const existing = admissionByLead.get(row.leadId);
    // A lead with two enrolments — someone who came back the next year —
    // is ONE admission worth both fees, not two people. Counting them
    // twice would flatter every conversion rate on the page.
    admissionByLead.set(row.leadId, {
      netFeePaise: (existing?.netFeePaise ?? 0) + row.netFeePaise,
      collectedPaise: (existing?.collectedPaise ?? 0) + (collectedByEnrolment.get(row.id) ?? 0),
    });
  }

  return input.leadIds.map((leadId) => {
    const campaign = campaignByLead.get(leadId);
    const admission = admissionByLead.get(leadId);
    return {
      leadId,
      platform: campaign?.platform ?? null,
      campaignId: campaign?.campaignId ?? null,
      isAdmission: admission !== undefined,
      netFeePaise: admission?.netFeePaise ?? 0,
      collectedPaise: admission?.collectedPaise ?? 0,
    };
  });
}

export interface CampaignPerformance {
  platform: string;
  campaignId: string;
  campaignName: string;
  spendPaise: number;
  impressions: number;
  clicks: number;
  leads: number;
  admissions: number;
  /** Net fee agreed on those admissions — revenue booked, not yet in the bank. */
  bookedPaise: number;
  /** What has actually been received against them. */
  collectedPaise: number;
  /** Null rather than Infinity when there is spend but no leads yet. */
  costPerLeadPaise: number | null;
  costPerAdmissionPaise: number | null;
  /** Booked revenue ÷ spend. Null when nothing was spent. */
  roas: number | null;
  /** Admissions ÷ leads, as a fraction. Null when there are no leads. */
  conversionRate: number | null;
}

/**
 * Every division in this file goes through here.
 *
 * A zero denominator is the normal state of a campaign that started
 * yesterday, not an error — and `x / 0` in JavaScript is `Infinity`, which
 * renders as "₹Infinity" and makes a screen look broken. Null means "not
 * yet answerable", and the UI prints a dash.
 */
function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** Paise per unit, rounded — a cost per lead is money and money here is an integer. */
function costPer(totalPaise: number, count: number): number | null {
  const value = ratio(totalPaise, count);
  return value === null ? null : Math.round(value);
}

function campaignKey(platform: string, campaignId: string): string {
  return `${platform}:${campaignId}`;
}

/**
 * Spend rows summed per campaign.
 *
 * The daily rows are per AD, so a campaign with nine creatives has nine
 * rows a night; summing is the whole job. The campaign name is taken from
 * whichever row has one — Meta and Google both occasionally return a null
 * name on a row, and a campaign shown as "(unnamed)" because one of its
 * thirty rows was blank would be a bug people would report.
 */
export function rollUpSpend(rows: SpendRow[]): Map<string, {
  platform: string;
  campaignId: string;
  campaignName: string | null;
  spendPaise: number;
  impressions: number;
  clicks: number;
}> {
  const byCampaign = new Map<string, {
    platform: string;
    campaignId: string;
    campaignName: string | null;
    spendPaise: number;
    impressions: number;
    clicks: number;
  }>();

  for (const row of rows) {
    const key = campaignKey(row.platform, row.campaignId);
    const existing = byCampaign.get(key);
    if (existing) {
      existing.spendPaise += row.spendPaise;
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.campaignName ??= row.campaignName;
    } else {
      byCampaign.set(key, {
        platform: row.platform,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        spendPaise: row.spendPaise,
        impressions: row.impressions,
        clicks: row.clicks,
        });
    }
  }
  return byCampaign;
}

/**
 * Spend and outcomes, joined, one row per campaign.
 *
 * Campaigns with spend and no leads are kept — a campaign burning money
 * and producing nothing is the single most useful row on the page, and
 * an inner join would hide exactly that one. Leads attributed to a
 * campaign that has no spend rows are kept too: it usually means the
 * spend sync has not run for that account, and silently dropping them
 * would make the lead total on this page disagree with Insights.
 */
export function combinePerformance(
  spendRows: SpendRow[],
  leads: AttributedLead[],
): CampaignPerformance[] {
  const spend = rollUpSpend(spendRows);

  interface Outcome {
    platform: string;
    campaignId: string;
    leads: number;
    admissions: number;
    bookedPaise: number;
    collectedPaise: number;
  }
  const outcomes = new Map<string, Outcome>();

  for (const lead of leads) {
    // A lead with no campaign came from somewhere that isn't paid
    // advertising — a walk-in, a referral, the website. It is not a
    // campaign row and must not be averaged into one.
    if (!lead.campaignId || !lead.platform) continue;
    const key = campaignKey(lead.platform, lead.campaignId);
    const outcome = outcomes.get(key) ?? {
      platform: lead.platform,
      campaignId: lead.campaignId,
      leads: 0,
      admissions: 0,
      bookedPaise: 0,
      collectedPaise: 0,
    };
    outcome.leads += 1;
    if (lead.isAdmission) {
      outcome.admissions += 1;
      outcome.bookedPaise += lead.netFeePaise;
      outcome.collectedPaise += lead.collectedPaise;
    }
    outcomes.set(key, outcome);
  }

  const keys = new Set([...spend.keys(), ...outcomes.keys()]);
  const rows: CampaignPerformance[] = [];

  for (const key of keys) {
    const s = spend.get(key);
    const o = outcomes.get(key);
    const platform = s?.platform ?? o?.platform ?? "";
    const campaignId = s?.campaignId ?? o?.campaignId ?? "";
    const spendPaise = s?.spendPaise ?? 0;
    const leadCount = o?.leads ?? 0;
    const admissions = o?.admissions ?? 0;
    const bookedPaise = o?.bookedPaise ?? 0;

    rows.push({
      platform,
      campaignId,
      // The id is a long number nobody recognises, but it is better than
      // a blank cell when the platform gave us no name.
      campaignName: s?.campaignName ?? campaignId,
      spendPaise,
      impressions: s?.impressions ?? 0,
      clicks: s?.clicks ?? 0,
      leads: leadCount,
      admissions,
      bookedPaise,
      collectedPaise: o?.collectedPaise ?? 0,
      costPerLeadPaise: costPer(spendPaise, leadCount),
      costPerAdmissionPaise: costPer(spendPaise, admissions),
      roas: ratio(bookedPaise, spendPaise),
      conversionRate: ratio(admissions, leadCount),
    });
  }

  // Most money first: the biggest line in the budget is the one worth
  // looking at, whether it is working or not.
  return rows.sort((a, b) => b.spendPaise - a.spendPaise);
}

export interface PerformanceTotals {
  spendPaise: number;
  leads: number;
  admissions: number;
  bookedPaise: number;
  collectedPaise: number;
  costPerLeadPaise: number | null;
  costPerAdmissionPaise: number | null;
  roas: number | null;
  conversionRate: number | null;
  /** Average net fee per admission — the "LTV" half of LTV:CAC. */
  averageAdmissionValuePaise: number | null;
  /**
   * Lifetime value over acquisition cost. Here LTV is the average fee an
   * admission agrees to and CAC is the cost per admission, so the ratio
   * answers "for every rupee of ad spend that becomes a student, how many
   * rupees of fee do we book?". It is deliberately not a multi-year
   * figure: AFD sells one course at a time and the CRM has no repeat
   * purchase to model, so inventing a retention multiplier would be
   * making the number up.
   */
  ltvToCac: number | null;
}

/**
 * Totals across every campaign.
 *
 * Summed from the campaign rows rather than recomputed from the raw
 * leads, so the bottom line and the rows above it can never disagree —
 * a table whose total is not the sum of its column is the fastest way to
 * lose somebody's trust in a report.
 */
export function performanceTotals(rows: CampaignPerformance[]): PerformanceTotals {
  const spendPaise = rows.reduce((sum, row) => sum + row.spendPaise, 0);
  const leads = rows.reduce((sum, row) => sum + row.leads, 0);
  const admissions = rows.reduce((sum, row) => sum + row.admissions, 0);
  const bookedPaise = rows.reduce((sum, row) => sum + row.bookedPaise, 0);
  const collectedPaise = rows.reduce((sum, row) => sum + row.collectedPaise, 0);

  const costPerAdmissionPaise = costPer(spendPaise, admissions);
  const averageAdmissionValuePaise = costPer(bookedPaise, admissions);

  return {
    spendPaise,
    leads,
    admissions,
    bookedPaise,
    collectedPaise,
    costPerLeadPaise: costPer(spendPaise, leads),
    costPerAdmissionPaise,
    roas: ratio(bookedPaise, spendPaise),
    conversionRate: ratio(admissions, leads),
    averageAdmissionValuePaise,
    ltvToCac:
      averageAdmissionValuePaise === null || costPerAdmissionPaise === null
        ? null
        : ratio(averageAdmissionValuePaise, costPerAdmissionPaise),
  };
}

/** "3.4×", or a dash when the ratio could not be worked out. */
export function formatMultiple(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}×`;
}

/** "12.5%", or a dash. */
export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}
