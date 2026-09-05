/**
 * Telling Google which clicks actually became admissions.
 *
 * Google Ads optimises against whatever you report back to it. AFD's
 * conversion, as far as Google currently knows, is a form submission —
 * so Smart Bidding has spent a year buying the cheapest form fills it can
 * find, which is not the same as buying students. The single biggest
 * lever on the Google budget is telling Google the truth: this GCLID,
 * eleven days later, enrolled and paid ₹85,000.
 *
 * Pure and tested, because the two ways this goes wrong are both silent.
 * Uploading the same admission twice teaches Google that one click was
 * worth twice what it was; uploading a click Google has already forgotten
 * fails at the API with an error nobody reads.
 */

/** Google discards a click after 90 days. A conversion attached to an older one is rejected. */
export const CLICK_WINDOW_DAYS = 90;

export interface ConversionCandidate {
  enrolmentId: string;
  /** The click id captured on the lead's first Google enquiry. */
  gclid: string | null;
  /** When the click happened — the start of the 90-day window. */
  clickedAt: string | null;
  /** When the admission became real. The conversion's own timestamp. */
  convertedAt: string | null;
  /** What it was worth, in paise. Google is told rupees. */
  valuePaise: number;
  droppedAt: string | null;
}

export interface EligibleConversion {
  enrolmentId: string;
  gclid: string;
  convertedAt: string;
  valuePaise: number;
}

export interface SkippedConversion {
  enrolmentId: string;
  reason: string;
}

export interface ConversionPlan {
  upload: EligibleConversion[];
  skipped: SkippedConversion[];
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

/**
 * Which admissions to report, and why the rest are not.
 *
 * `alreadyUploaded` is the set of enrolment ids that have been sent for
 * this conversion action before. It is the whole double-count defence,
 * and it is backed by a unique index rather than trusted to this
 * function's bookkeeping — a retry after a timeout must not tell Google
 * about the same ₹85,000 twice.
 *
 * The skip reasons are returned rather than swallowed. "Nothing was
 * uploaded" is indistinguishable from "everything was already uploaded"
 * and from "no lead this month came from Google", and somebody
 * investigating why their bidding has not improved needs to know which.
 */
export function planConversions(
  candidates: ConversionCandidate[],
  alreadyUploaded: Set<string>,
  asOf: string,
): ConversionPlan {
  const upload: EligibleConversion[] = [];
  const skipped: SkippedConversion[] = [];

  for (const candidate of candidates) {
    if (alreadyUploaded.has(candidate.enrolmentId)) continue;

    if (!candidate.gclid) {
      // Most admissions. They came from Meta, a walk-in or a referral, and
      // there is nothing for Google to learn from them.
      skipped.push({ enrolmentId: candidate.enrolmentId, reason: "Not a Google click." });
      continue;
    }
    if (!candidate.convertedAt) {
      skipped.push({ enrolmentId: candidate.enrolmentId, reason: "Hasn't converted yet." });
      continue;
    }
    if (candidate.droppedAt) {
      // Reporting a dropped admission would teach Google to buy more
      // people who drop out.
      skipped.push({ enrolmentId: candidate.enrolmentId, reason: "Dropped." });
      continue;
    }
    if (Date.parse(candidate.convertedAt) > Date.parse(asOf)) {
      skipped.push({ enrolmentId: candidate.enrolmentId, reason: "Dated in the future." });
      continue;
    }

    if (candidate.clickedAt) {
      const age = daysBetween(candidate.clickedAt, asOf);
      if (age > CLICK_WINDOW_DAYS) {
        // Google has forgotten the click. Uploading it fails with an
        // error nobody reads, so it is skipped with a reason somebody can.
        skipped.push({
          enrolmentId: candidate.enrolmentId,
          reason: `The click is ${Math.round(age)} days old — Google only keeps ${CLICK_WINDOW_DAYS}.`,
        });
        continue;
      }
    }

    upload.push({
      enrolmentId: candidate.enrolmentId,
      gclid: candidate.gclid,
      convertedAt: candidate.convertedAt,
      valuePaise: Math.max(0, candidate.valuePaise),
    });
  }

  return { upload, skipped };
}

/**
 * Google's required conversion timestamp format:
 * `yyyy-MM-dd HH:mm:ss+05:30`. Not ISO 8601 — a `T` or a `Z` is rejected,
 * and an offset is mandatory. Asia/Kolkata is a fixed +05:30 with no DST,
 * which is the only reason this can be done with arithmetic rather than a
 * timezone database.
 */
export function formatConversionDateTime(instant: string | Date): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new Error("formatConversionDateTime: not a date");

  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ` +
    `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}+05:30`
  );
}

/**
 * Paise to rupees, as a number Google will accept.
 *
 * Money is paise everywhere in this system (CLAUDE.md), and Google's API
 * wants a decimal amount in the account's currency. This is the ONLY
 * place the two meet, and rounding to two places here means the figure
 * Google optimises against and the figure on the receipt agree.
 */
export function toConversionValue(paise: number): number {
  return Math.round(paise) / 100;
}
