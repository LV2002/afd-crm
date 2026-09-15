import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { writeAuditLog } from "@/lib/audit/log";
import { captureError } from "@/lib/errors/capture";

/**
 * The seatbelt on lead creation.
 *
 * `resolveOrCreateLead()` runs on the direct database client, which
 * bypasses RLS. That is the right call for its original callers — webhooks
 * and cron, which CLAUDE.md § 3 explicitly allows the unrestricted path —
 * and it is also structurally necessary: creating a lead spans `leads`,
 * `lead_identifiers`, `enquiries` and `merge_review_queue` in one
 * transaction, and takes a `FOR UPDATE` lock in the round-robin assignment
 * path. PostgREST cannot express that, so the RLS-bound client cannot do
 * the write.
 *
 * But two browser-reachable Server Actions call it too — manual entry and
 * CSV import — and for those, CLAUDE.md § 3's rule bites: "App code must
 * never be the only thing standing between a counsellor and another
 * counsellor's leads." Their scope checks are correct today; what was
 * missing was anything to catch it if they stopped being.
 *
 * So: after the write, read the row back through the caller's *own*
 * client. If RLS will not show it to them, they should not have been able
 * to create it — the app-level check has failed, and this says so loudly
 * rather than leaving a lead sitting in a centre nobody expected.
 *
 * ## Why it does not delete the lead
 *
 * Tempting, and wrong. This fires on a bug, and on a bug the safest thing
 * to do with a real enquiry from a real person is keep it. The lead is
 * visible to whoever legitimately owns that centre, the actor is told
 * plainly that it failed, and an admin gets an alert naming the row. Data
 * loss on a false positive would be a worse outcome than the fault being
 * reported.
 *
 * Security audit 2026-09-15, finding #2.
 */

export interface LeadVisibilityCheck {
  leadId: string;
  actorId: string;
  /** Where this happened, for the alert: "createLeadManually", "importLeads". */
  source: string;
  /** Anything that helps work out which input caused it. Never PII. */
  context?: Record<string, unknown>;
}

export async function leadIsVisibleToCaller(
  supabase: SupabaseClient,
  check: LeadVisibilityCheck,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("id", check.leadId)
    .maybeSingle<{ id: string }>();

  if (data) return true;

  // A read error and an invisible row are treated the same on purpose.
  // Either way the assertion did not pass, and "the check itself broke" is
  // not a reason to wave a write through unverified.
  await captureError({
    source: `scope:${check.source}`,
    error: new Error(
      `Lead ${check.leadId} was created but is not visible to its creator — the scope check in ` +
        `${check.source} let through a lead that RLS refuses. This is a bug, not a user error.`,
    ),
    context: { ...check.context, leadId: check.leadId, actorId: check.actorId, readError: error?.message ?? null },
  }).catch(() => {});

  await writeAuditLog(supabase, {
    actorId: check.actorId,
    action: "lead.scope_violation",
    entityType: "leads",
    entityId: check.leadId,
    after: { source: check.source, ...check.context },
  });

  return false;
}

/** What the user is told. Deliberately not "you don't have permission" — they might, and the code is at fault. */
export const SCOPE_VIOLATION_MESSAGE =
  "The lead was created but could not be confirmed against your access. It has been flagged for an administrator — please check with them before trying again.";
