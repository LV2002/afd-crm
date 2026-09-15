/**
 * Word of mouth, counted.
 *
 * A 25-year-old institute in two Kerala towns runs substantially on past
 * students telling the next batch about it, and until now that was the one
 * source the CRM could not see: `referred_by_lead_id` has been a column
 * since the first migration with nothing able to write it, so every
 * referral was filed under whatever the counsellor picked from the source
 * dropdown — usually "Walk-in", occasionally "Reference", never linked to
 * the person who actually sent them.
 *
 * These functions answer the two questions Leon asked for: how many people
 * came by referral, and who is sending them. Everything here is pure — the
 * rows come from `load-report-leads.ts`, which decides what the caller may
 * see — so the arithmetic can be tested without a database.
 */

export interface ReferralRow {
  leadId: string;
  /** The lead who sent them, or null for everybody else. */
  referredByLeadId: string | null;
  admitted: boolean;
  /** `yyyy-MM-dd` in IST. */
  arrivedOn: string;
}

export interface ReferralSummary {
  totalLeads: number;
  referredLeads: number;
  /** Referred leads as a fraction of all leads, 0–1. */
  referredShare: number;
  referredAdmissions: number;
  otherAdmissions: number;
  /** 0–1. */
  referredConversion: number;
  /** 0–1. */
  otherConversion: number;
  /**
   * Referred conversion minus everybody else's, in percentage points.
   * Positive means a referred enquiry is likelier to enrol — which is the
   * whole argument for spending anything on asking for referrals.
   */
  conversionLiftPoints: number;
  /** Distinct people who have sent at least one lead. */
  referrerCount: number;
}

export function summariseReferrals(rows: ReferralRow[]): ReferralSummary {
  const referred = rows.filter((row) => row.referredByLeadId !== null);
  const other = rows.filter((row) => row.referredByLeadId === null);

  const referredAdmissions = referred.filter((row) => row.admitted).length;
  const otherAdmissions = other.filter((row) => row.admitted).length;

  const referredConversion = share(referredAdmissions, referred.length);
  const otherConversion = share(otherAdmissions, other.length);

  return {
    totalLeads: rows.length,
    referredLeads: referred.length,
    referredShare: share(referred.length, rows.length),
    referredAdmissions,
    otherAdmissions,
    referredConversion,
    otherConversion,
    conversionLiftPoints: round1((referredConversion - otherConversion) * 100),
    referrerCount: new Set(referred.map((row) => row.referredByLeadId)).size,
  };
}

export interface ReferrerStanding {
  referrerId: string;
  referrals: number;
  admissions: number;
  /** 0–1. */
  conversion: number;
  /** `yyyy-MM-dd` of the most recent person they sent. */
  lastReferralOn: string;
}

/**
 * Who is actually sending people.
 *
 * Ranked by admissions first and referrals second: somebody who sent four
 * people who all enrolled matters more than somebody who sent nine who
 * did not, and a leaderboard that says otherwise sends the counsellor to
 * thank the wrong person.
 */
export function topReferrers(rows: ReferralRow[], limit?: number): ReferrerStanding[] {
  const byReferrer = new Map<string, ReferralRow[]>();
  for (const row of rows) {
    if (!row.referredByLeadId) continue;
    const bucket = byReferrer.get(row.referredByLeadId);
    if (bucket) bucket.push(row);
    else byReferrer.set(row.referredByLeadId, [row]);
  }

  const standings = [...byReferrer.entries()].map(([referrerId, sent]) => {
    const admissions = sent.filter((row) => row.admitted).length;
    return {
      referrerId,
      referrals: sent.length,
      admissions,
      conversion: share(admissions, sent.length),
      lastReferralOn: sent.reduce((latest, row) => (row.arrivedOn > latest ? row.arrivedOn : latest), ""),
    };
  });

  standings.sort(
    (a, b) =>
      b.admissions - a.admissions ||
      b.referrals - a.referrals ||
      a.referrerId.localeCompare(b.referrerId),
  );

  return typeof limit === "number" ? standings.slice(0, limit) : standings;
}

export interface ReferralMonth {
  /** `yyyy-MM`. */
  month: string;
  leads: number;
  referred: number;
  /** 0–1. */
  referredShare: number;
  referredAdmissions: number;
}

/**
 * The trend, because the headline number on its own cannot tell "we always
 * got a third by referral" apart from "we suddenly get a third by
 * referral". Months with no leads at all are simply absent — this is a
 * table, not a chart axis, and inventing empty months to fill a gap makes
 * a quiet month look like a closed one.
 */
export function referralsByMonth(rows: ReferralRow[]): ReferralMonth[] {
  const byMonth = new Map<string, ReferralRow[]>();
  for (const row of rows) {
    const month = row.arrivedOn.slice(0, 7);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(row);
    else byMonth.set(month, [row]);
  }

  return [...byMonth.entries()]
    .map(([month, monthRows]) => {
      const referred = monthRows.filter((row) => row.referredByLeadId !== null);
      return {
        month,
        leads: monthRows.length,
        referred: referred.length,
        referredShare: share(referred.length, monthRows.length),
        referredAdmissions: referred.filter((row) => row.admitted).length,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Referrals that came from somebody who was themselves referred.
 *
 * The interesting number in a word-of-mouth business: it means the chain
 * is self-sustaining rather than resting on one cohort of old students.
 */
export function secondGenerationCount(rows: ReferralRow[]): number {
  const wasReferred = new Set(rows.filter((row) => row.referredByLeadId).map((row) => row.leadId));
  return rows.filter((row) => row.referredByLeadId && wasReferred.has(row.referredByLeadId)).length;
}

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
