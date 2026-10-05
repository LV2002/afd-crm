/**
 * Which Meta permission powers which feature, said in consequences.
 *
 * ## Why this exists
 *
 * `debug_token` returns the exact list of permissions a token actually
 * holds. The CRM has been calling it since the Test connection button was
 * built, reading `is_valid`, `app_id`, `type` and `expires_at` — and
 * throwing `scopes` away.
 *
 * That discarded field is the answer to the question that has cost the
 * most time on this integration: *why do Instagram DMs arrive from staff
 * and nobody else?* A token with Standard access to
 * `instagram_manage_messages` and one with Advanced access are identical
 * from every screen in this application, and Meta's own Permissions and
 * Features page is slow, sometimes renders empty, and is gated behind
 * business verification. Meanwhile the truth was arriving in an API
 * response we already made, on a screen the administrator was already
 * looking at.
 *
 * Same failure as the cron that was refused silently, the webhook
 * deliveries nobody could see, and the escalation rung that did nothing:
 * **the platform said, and the tool did not pass it on.**
 *
 * ## Said as consequences, not permission names
 *
 * `pages_messaging` means nothing to somebody running a coaching
 * institute. "Instagram DMs are delivered to the CRM" does. The
 * permission name is still printed, because it is what has to be typed
 * into Meta's request form — but it comes second.
 *
 * ## What this cannot see
 *
 * Standard versus Advanced access. `debug_token` lists a permission the
 * app holds; it does not say whether that permission works for the
 * public or only for people with a role on the app. So a *missing*
 * permission here is definitive, and a *present* one still leaves the
 * Standard/Advanced question open — which the copy says rather than
 * implying a green tick means everything works.
 */

export interface ScopeRequirement {
  scope: string;
  /** What stops working without it, in the words of somebody running the institute. */
  consequence: string;
}

/** Permissions the Page token needs, in roughly the order somebody sets them up. */
export const PAGE_TOKEN_SCOPES: ScopeRequirement[] = [
  { scope: "pages_show_list", consequence: "Seeing which Pages this account manages" },
  { scope: "pages_read_engagement", consequence: "Reading the Page at all" },
  { scope: "pages_manage_metadata", consequence: "Subscribing the Page, without which nothing is delivered" },
  { scope: "leads_retrieval", consequence: "Fetching a submitted Lead Ads form's answers" },
  { scope: "pages_messaging", consequence: "Receiving Instagram DMs and Messenger messages" },
  { scope: "instagram_basic", consequence: "Reading the linked Instagram account" },
  { scope: "instagram_manage_messages", consequence: "Instagram DMs, in and out" },
];

/** Permissions the Ads token needs. A Page token will not carry these. */
export const ADS_TOKEN_SCOPES: ScopeRequirement[] = [
  { scope: "ads_read", consequence: "Ad spend sync — what Meta charged" },
  { scope: "ads_management", consequence: "Retargeting audiences pushed back to Meta" },
];

export interface ScopeReport {
  granted: string[];
  missing: ScopeRequirement[];
}

/**
 * What the token has, against what the CRM needs it to have.
 *
 * An empty `scopes` from Meta is treated as unknown rather than as
 * "nothing granted": a System User token can come back without the list,
 * and reporting seven missing permissions for a token that works would
 * send somebody to fix what is not broken.
 */
export function compareScopes(
  granted: string[] | undefined,
  required: ScopeRequirement[],
): ScopeReport | null {
  if (!granted || granted.length === 0) return null;
  const held = new Set(granted);
  return {
    granted,
    missing: required.filter((entry) => !held.has(entry.scope)),
  };
}

/** One sentence for the Test connection result. */
export function describeMissingScopes(report: ScopeReport | null): string | null {
  if (!report || report.missing.length === 0) return null;
  const list = report.missing
    .map((entry) => `${entry.consequence} (${entry.scope})`)
    .join("; ");
  return `Missing: ${list}.`;
}
