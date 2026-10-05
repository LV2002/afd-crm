import { Plus } from "lucide-react";
import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Button } from "@/components/ui/button";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { ALIASES } from "@/lib/integrations/form-payload/map-fields";
import { createClient } from "@/lib/supabase/server";

import { formatAliases } from "./actions";
import { NewWebhookForm } from "./new-webhook-form";
import { WebhookCard, type CustomWebhookView } from "./webhook-card";

interface WebhookRow {
  id: string;
  name: string;
  slug: string;
  source: string;
  sub_source: string | null;
  center_id: string | null;
  signing_secret: string;
  require_signature: boolean;
  field_aliases: Record<string, string[]> | null;
  is_active: boolean;
}

interface DeliveryRow {
  custom_webhook_id: string | null;
  received_at: string;
  status: string;
  last_error: string | null;
}

/**
 * Endpoints an admin creates, for sources nobody wrote a handler for.
 *
 * The thing this replaces is a conversation: "can the CRM take leads from
 * X?" followed by a day of work and a deploy. Now it is a row with its own
 * URL, its own secret and its own source name, and the sources report can
 * tell one feed from another the moment it starts arriving.
 *
 * Read through the caller's own client: `custom_webhooks_select` limits
 * this to `settings.manage` at org scope, because the rows carry signing
 * secrets and anybody who can read one can forge a delivery.
 */
export default async function CustomWebhooksPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();

  const [{ data: rows }, { data: centerRows }, { data: deliveryRows }] = await Promise.all([
    supabase
      .from("custom_webhooks")
      .select(
        "id, name, slug, source, sub_source, center_id, signing_secret, require_signature, field_aliases, is_active",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .returns<WebhookRow[]>(),
    supabase
      .from("centers")
      .select("id, name")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name")
      .returns<Array<{ id: string; name: string }>>(),
    // One query for every endpoint's delivery summary rather than one per
    // card: with a handful of endpoints and ten rows each this is cheaper
    // than the round trips, and the counts are only a headline.
    supabase
      .from("webhook_events")
      .select("custom_webhook_id, received_at, status, last_error")
      .eq("source", "custom")
      .order("received_at", { ascending: false })
      .limit(500)
      .returns<DeliveryRow[]>(),
  ]);

  const summary = new Map<string, { count: number; lastAt: string; lastError: string | null }>();
  for (const row of deliveryRows ?? []) {
    if (!row.custom_webhook_id) continue;
    const existing = summary.get(row.custom_webhook_id);
    if (existing) {
      existing.count += 1;
      // Rows arrive newest first, so the first failure seen is the most
      // recent one — and that is the one worth putting on the card.
      if (!existing.lastError && row.status === "failed") existing.lastError = row.last_error;
    } else {
      summary.set(row.custom_webhook_id, {
        count: 1,
        lastAt: formatDateIST(row.received_at, "d MMM, h:mm a"),
        lastError: row.status === "failed" ? row.last_error : null,
      });
    }
  }

  const webhooks: CustomWebhookView[] = await Promise.all(
    (rows ?? []).map(async (row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      source: row.source,
      subSource: row.sub_source,
      centerId: row.center_id,
      signingSecret: row.signing_secret,
      requireSignature: row.require_signature,
      aliasText: await formatAliases(row.field_aliases),
      isActive: row.is_active,
      deliveries: summary.get(row.id)?.count ?? 0,
      lastDeliveryAt: summary.get(row.id)?.lastAt ?? null,
      lastError: summary.get(row.id)?.lastError ?? null,
    })),
  );

  const centers = centerRows ?? [];
  const aliasFields = Object.keys(ALIASES);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Custom webhooks</h2>
          <p className="max-w-2xl text-muted-foreground">
            An endpoint for any service that can post JSON — a course platform, a form builder, a
            Zapier step, a landing page. Each one gets its own URL and its own source name, so the
            reports can tell them apart.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/settings/integrations">Back to integrations</Link>
        </Button>
      </div>

      {/*
        Said once, at the top, because it is the thing that makes these
        safe to hand out: a custom webhook is not a shortcut around the
        rules the built-in ones follow.
      */}
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p>
          Leads from here go through exactly the same path as a Meta lead: the raw delivery is
          written down before anything is done with it, a phone number already in the system
          attaches as a second enquiry rather than becoming a duplicate, and the assignment rules
          decide the owner.
        </p>
      </div>

      {webhooks.length > 0 && (
        <section className="flex flex-col gap-3">
          {webhooks.map((webhook) => (
            <WebhookCard
              key={webhook.id}
              webhook={webhook}
              centers={centers}
              aliasFields={aliasFields}
            />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 font-medium">
          <Plus className="size-4" />
          {webhooks.length === 0 ? "Add your first endpoint" : "Add another endpoint"}
        </h3>
        <NewWebhookForm centers={centers} />
      </section>
    </div>
  );
}
