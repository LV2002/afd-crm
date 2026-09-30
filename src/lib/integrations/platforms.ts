import { adPlatformEnum } from "@/lib/db/schema";

/**
 * The advertising platforms this CRM knows about.
 *
 * Derived from the `ad_platform` Postgres enum rather than listed again
 * here: adding a platform already needs a migration to extend that enum, and
 * a second hand-maintained list would be one more thing to forget. The
 * `satisfies` on `LABELS` means adding an enum value **fails the build**
 * until somebody gives it a name and a colour — which is the good kind of
 * forced update, since a platform with no label would render as a blank tab.
 *
 * To add a platform later: extend the enum in a migration, add a row to
 * `LABELS`, and build the webhook and spend-sync routes for it. Every tab,
 * filter and label in the reporting screens picks it up with no further
 * change.
 */

export type AdPlatform = (typeof adPlatformEnum.enumValues)[number];

interface PlatformMeta {
  /** What a person calls it, not what the API calls it. */
  label: string;
  /** Short form for a badge where the full name will not fit. */
  short: string;
}

const LABELS = {
  meta: { label: "Meta Ads", short: "Meta" },
  google: { label: "Google Ads", short: "Google" },
} as const satisfies Record<AdPlatform, PlatformMeta>;

export interface AdPlatformDefinition extends PlatformMeta {
  key: AdPlatform;
}

export const AD_PLATFORMS: AdPlatformDefinition[] = adPlatformEnum.enumValues.map((key) => ({
  key,
  ...LABELS[key],
}));

export function isAdPlatform(value: string): value is AdPlatform {
  return (adPlatformEnum.enumValues as readonly string[]).includes(value);
}

/** The platform's own name, or the raw key if the enum somehow got ahead of the labels. */
export function platformLabel(key: string): string {
  return isAdPlatform(key) ? LABELS[key].label : key;
}

export function platformShort(key: string): string {
  return isAdPlatform(key) ? LABELS[key].short : key;
}
