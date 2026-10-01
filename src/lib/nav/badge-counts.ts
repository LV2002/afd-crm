import "server-only";

import { can, type SessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { navBadgesFor, type NavBadgeCounts, type NavBadgeKey } from "./badge-permissions";

export {
  NAV_BADGE_KEYS,
  NAV_BADGE_PERMISSION,
  navBadgesFor,
  type NavBadgeCounts,
  type NavBadgeKey,
} from "./badge-permissions";

/**
 * The red counts beside the sidebar's queues.
 *
 * Five screens in this system are work queues somebody is supposed to
 * notice: unassigned leads nobody owns, admissions a counsellor has
 * confirmed and accounts has not collected on, profile forms a student has
 * sent that nobody has read, WhatsApp threads where the other person wrote
 * last, and students academics has not onboarded. Each was only visible to
 * somebody who thought to go and look, which for a queue whose whole point
 * is "these are being forgotten" is close to not having one.
 *
 * ## Scope comes from RLS, not from here
 *
 * Every count runs through the caller's own client, so a counsellor's
 * WhatsApp number is their own threads and a centre head's unassigned
 * count is their centre's. Nothing here filters by centre; the policies
 * do. What this module decides is only whether to ask at all — a count for
 * a screen the person cannot open is a wasted round trip, and a zero they
 * would misread as "nothing to do".
 *
 * ## Why these are cheap
 *
 * This runs on every navigation, on a sidebar Leon has already told us
 * feels slow. So: `head: true` counts that return a number and no rows,
 * all of them in one `Promise.all`, and the WhatsApp one through the
 * `whatsapp_thread_latest` view rather than by reading three thousand
 * message rows into memory (migration 0073). The caller renders them
 * inside a Suspense boundary, so the nav itself never waits.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

const COUNTERS: Record<NavBadgeKey, (supabase: Client) => Promise<number>> = {
  unassigned: countUnassignedLeads,
  admissions: countAwaitingFirstPayment,
  profileForms: countUnreadProfileForms,
  whatsapp: countThreadsAwaitingReply,
  onboarding: countStudentsInOnboarding,
};

export async function getNavBadgeCounts(user: SessionUser): Promise<NavBadgeCounts> {
  const supabase = await createClient();
  const keys = navBadgesFor((code) => can(user, code));

  const values = await Promise.all(keys.map((key) => COUNTERS[key](supabase)));

  const counts: NavBadgeCounts = {};
  keys.forEach((key, index) => {
    counts[key] = values[index];
  });
  return counts;
}

/**
 * Leads no rule matched and nobody has claimed.
 *
 * Terminal stages are excluded for the same reason the orphan queue itself
 * excludes them: a lead that is won or lost needs no owner, and counting
 * one would put a number on the sidebar that cannot be worked down to zero.
 */
async function countUnassignedLeads(supabase: Client): Promise<number> {
  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("id, stage_type")
    .returns<Array<{ id: string; stage_type: string }>>();

  const terminal = (stages ?? [])
    .filter((stage) => stage.stage_type === "won" || stage.stage_type === "lost")
    .map((stage) => stage.id);

  let query = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("assigned_to", null)
    .is("deleted_at", null);

  // A lead with no stage at all is still unassigned work, so the filter has
  // to keep nulls — `not in (…)` alone would drop them.
  if (terminal.length > 0) {
    query = query.or(`stage_id.is.null,stage_id.not.in.(${terminal.join(",")})`);
  }

  const { count } = await query;
  return count ?? 0;
}

/** Admissions a counsellor has confirmed that have not paid yet. */
async function countAwaitingFirstPayment(supabase: Client): Promise<number> {
  const { count } = await supabase
    .from("enrolments")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    // Somebody who dropped out is not a payment to chase — the same
    // exclusion the accounts widget and the handover report both make.
    .is("dropped_at", null)
    .not("sales_to_accounts_at", "is", null)
    .is("accounts_to_academics_at", null);
  return count ?? 0;
}

/**
 * Profile forms a student has sent that nobody has read.
 *
 * "Read" is a real step rather than a guess at one (migration 0076). The
 * alternative definitions were "every form ever", which never reaches zero
 * and teaches people to ignore the badge, and "the last few days", which
 * empties itself whether or not anybody looked.
 */
async function countUnreadProfileForms(supabase: Client): Promise<number> {
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .not("profile_form_submitted_at", "is", null)
    .is("profile_form_reviewed_at", null);
  return count ?? 0;
}

/** Threads whose most recent message came from the other person. */
async function countThreadsAwaitingReply(supabase: Client): Promise<number> {
  const { count } = await supabase
    .from("whatsapp_thread_latest")
    .select("thread_key", { count: "exact", head: true })
    .eq("last_direction", "inbound");
  return count ?? 0;
}

/** Students accounts has handed over that academics has not accepted. */
async function countStudentsInOnboarding(supabase: Client): Promise<number> {
  const { count } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .is("onboarded_at", null);
  return count ?? 0;
}
