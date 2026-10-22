/**
 * What became of one inbound delivery, in words a person can act on.
 *
 * `webhook_events` records that something arrived and how handling went;
 * the enquiry it produced (if any) is found through `dedupe_key`. Put
 * together, the question "I sent nine leads and only three are in the CRM"
 * has a different answer per row:
 *
 * - **created** — became a new lead.
 * - **linked** — the person was already a lead, so the enquiry was added to
 *   THEM. Nothing is missing from the CRM; the list has one row per
 *   person, not per enquiry (non-negotiable #2: never reject a duplicate).
 * - **refused** — turned away at the door (bad signature or key).
 * - **failed** — arrived and was accepted, but could not become a lead: no
 *   name or phone, or an error while saving. The reason is kept.
 * - **pending** — stored, not yet processed.
 * - **accepted** — processed and not a lead (a WhatsApp message, a status).
 *
 * Deliveries that never arrived leave no row at all, which is itself the
 * answer: the sender did not call, or called a wrong address.
 */
export type DeliveryOutcome = "created" | "linked" | "refused" | "failed" | "pending" | "accepted";

export interface DeliveryFacts {
  signatureOk: boolean;
  status: string;
  /** The enquiry this delivery produced, when it produced one. */
  enquiry: { wasDuplicate: boolean } | null;
}

export function classifyDelivery({ signatureOk, status, enquiry }: DeliveryFacts): DeliveryOutcome {
  if (status === "failed") return signatureOk ? "failed" : "refused";
  if (enquiry) return enquiry.wasDuplicate ? "linked" : "created";
  if (status === "pending") return "pending";
  return "accepted";
}

export const OUTCOME_LABELS: Record<DeliveryOutcome, string> = {
  created: "New lead",
  linked: "Added to an existing lead",
  refused: "Refused",
  failed: "Could not become a lead",
  pending: "Waiting to be processed",
  accepted: "Processed",
};
